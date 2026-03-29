"""
YouTube video fetcher using Data API v3 with RSS fallback.
Handles quota management and provides rich video metadata.
"""

import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, asdict
import feedparser
import requests
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from tenacity import retry, stop_after_attempt, wait_exponential

from config import config

logger = logging.getLogger(__name__)


@dataclass
class VideoInfo:
    """Represents a YouTube video with all metadata."""
    id: str
    title: str
    description: str
    channel_id: str
    channel_title: str
    published_at: str
    duration: str  # ISO 8601 format (e.g., PT1M30S)
    view_count: int
    like_count: int
    comment_count: int
    tags: List[str]
    thumbnails: Dict[str, Any]
    url: str
    is_short: bool
    source: str  # 'api' or 'rss'
    
    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return asdict(self)


class YouTubeFetcher:
    """Fetch YouTube videos using API v3 with RSS fallback."""
    
    def __init__(self):
        self.api_key = config.youtube_api_key
        self.channel_id = config.youtube_channel_id
        self.playlists = config.youtube_playlists
        self.youtube = None
        self._initialize_api()
    
    def _initialize_api(self):
        """Initialize YouTube Data API client."""
        try:
            self.youtube = build(
                'youtube',
                'v3',
                developerKey=self.api_key,
                cache_discovery=False
            )
            logger.info("YouTube Data API client initialized")
        except Exception as e:
            logger.error(f"Failed to initialize YouTube API: {e}")
            self.youtube = None
    
    def _parse_iso_duration(self, duration: str) -> int:
        """
        Parse ISO 8601 duration to seconds.
        Example: PT1M30S -> 90 seconds
        """
        import re
        
        if not duration:
            return 0
        
        pattern = r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?'
        match = re.match(pattern, duration)
        
        if not match:
            return 0
        
        hours = int(match.group(1) or 0)
        minutes = int(match.group(2) or 0)
        seconds = int(match.group(3) or 0)
        
        return hours * 3600 + minutes * 60 + seconds
    
    def _is_short(self, title: str, duration_seconds: int) -> bool:
        """Detect if video is a Short."""
        # Check duration (< 60 seconds)
        if duration_seconds > 0 and duration_seconds < 60:
            return True
        
        # Check title for #Shorts
        if '#shorts' in title.lower():
            return True
        
        return False
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def _fetch_from_api(self, max_results: int = 5) -> List[VideoInfo]:
        """Fetch recent videos from YouTube Data API."""
        if not self.youtube:
            raise Exception("YouTube API client not initialized")
        
        videos = []
        
        # Search for uploads from channel
        try:
            search_response = self.youtube.search().list(
                channelId=self.channel_id,
                order='date',
                part='id',
                type='video',
                maxResults=max_results
            ).execute()
            
            video_ids = [
                item['id']['videoId'] 
                for item in search_response.get('items', [])
            ]
            
            if not video_ids:
                return videos
            
            # Fetch detailed video information
            videos_response = self.youtube.videos().list(
                part='snippet,contentDetails,statistics',
                id=','.join(video_ids)
            ).execute()
            
            for item in videos_response.get('items', []):
                video_info = self._parse_video_item(item, source='api')
                if video_info:
                    videos.append(video_info)
            
            logger.info(f"Fetched {len(videos)} videos from API")
            
        except HttpError as e:
            if e.resp.status == 403:
                logger.warning("YouTube API quota exceeded")
                raise
            raise
        
        # Also check playlists
        for playlist_id in self.playlists:
            try:
                playlist_videos = self._fetch_playlist_videos(playlist_id, max_results=2)
                videos.extend(playlist_videos)
            except Exception as e:
                logger.warning(f"Failed to fetch playlist {playlist_id}: {e}")
        
        # Remove duplicates by video ID
        seen_ids = set()
        unique_videos = []
        for video in videos:
            if video.id not in seen_ids:
                seen_ids.add(video.id)
                unique_videos.append(video)
        
        return unique_videos
    
    def _fetch_playlist_videos(self, playlist_id: str, max_results: int = 2) -> List[VideoInfo]:
        """Fetch videos from a specific playlist."""
        videos = []
        
        playlist_items_response = self.youtube.playlistItems().list(
            playlistId=playlist_id,
            part='snippet',
            maxResults=max_results
        ).execute()
        
        video_ids = [
            item['snippet']['resourceId']['videoId']
            for item in playlist_items_response.get('items', [])
            if item['snippet']['resourceId'].get('kind') == 'youtube#video'
        ]
        
        if not video_ids:
            return videos
        
        videos_response = self.youtube.videos().list(
            part='snippet,contentDetails,statistics',
            id=','.join(video_ids)
        ).execute()
        
        for item in videos_response.get('items', []):
            video_info = self._parse_video_item(item, source='api')
            if video_info:
                videos.append(video_info)
        
        return videos
    
    def _parse_video_item(self, item: Dict, source: str = 'api') -> Optional[VideoInfo]:
        """Parse a YouTube API response item into VideoInfo."""
        try:
            snippet = item.get('snippet', {})
            content_details = item.get('contentDetails', {})
            statistics = item.get('statistics', {})
            
            duration = content_details.get('duration', '')
            duration_seconds = self._parse_iso_duration(duration)
            
            # Extract high-resolution thumbnail
            thumbnails = snippet.get('thumbnails', {})
            thumbnail_urls = {}
            for size in ['default', 'medium', 'high', 'standard', 'maxres']:
                if size in thumbnails:
                    thumbnail_urls[size] = thumbnails[size].get('url', '')
            
            video = VideoInfo(
                id=item['id'],
                title=snippet.get('title', 'Untitled'),
                description=snippet.get('description', ''),
                channel_id=snippet.get('channelId', ''),
                channel_title=snippet.get('channelTitle', ''),
                published_at=snippet.get('publishedAt', ''),
                duration=duration,
                view_count=int(statistics.get('viewCount', 0)),
                like_count=int(statistics.get('likeCount', 0)),
                comment_count=int(statistics.get('commentCount', 0)),
                tags=snippet.get('tags', []),
                thumbnails=thumbnail_urls,
                url=f"https://www.youtube.com/watch?v={item['id']}",
                is_short=self._is_short(snippet.get('title', ''), duration_seconds),
                source=source
            )
            
            return video
            
        except Exception as e:
            logger.error(f"Error parsing video item: {e}")
            return None
    
    def _fetch_from_rss(self) -> List[VideoInfo]:
        """Fallback: Fetch videos from YouTube RSS feed."""
        videos = []
        
        # Channel RSS feed
        rss_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={self.channel_id}"
        
        try:
            feed = feedparser.parse(rss_url)
            
            for entry in feed.entries[:5]:  # Limit to 5 most recent
                try:
                    # Extract video ID from entry.id
                    video_id = entry.id.split(':')[-1] if ':' in entry.id else entry.id
                    
                    # RSS doesn't provide duration, so we'll fetch it separately
                    duration_seconds = 0
                    is_short = '#shorts' in entry.title.lower()
                    
                    video = VideoInfo(
                        id=video_id,
                        title=entry.title,
                        description=entry.get('summary', ''),
                        channel_id=entry.get('yt_channelid', self.channel_id),
                        channel_title=entry.get('author', 'Nature Frontiers'),
                        published_at=entry.published,
                        duration='',
                        view_count=int(entry.get('yt_viewcount', 0)),
                        like_count=0,
                        comment_count=0,
                        tags=[],
                        thumbnails={'high': entry.get('media_thumbnail', [{}])[0].get('url', '')},
                        url=entry.link,
                        is_short=is_short,
                        source='rss'
                    )
                    
                    videos.append(video)
                    
                except Exception as e:
                    logger.warning(f"Error parsing RSS entry: {e}")
                    continue
            
            logger.info(f"Fetched {len(videos)} videos from RSS fallback")
            
        except Exception as e:
            logger.error(f"RSS fetch failed: {e}")
        
        return videos
    
    def get_new_videos(self, processed_ids: set) -> List[VideoInfo]:
        """
        Get new videos that haven't been processed yet.
        Tries API first, falls back to RSS on quota error.
        """
        videos = []
        
        # Try API first
        try:
            videos = self._fetch_from_api()
        except HttpError as e:
            if e.resp.status == 403:
                logger.warning("API quota exceeded, falling back to RSS")
                videos = self._fetch_from_rss()
            else:
                logger.error(f"API error: {e}")
                videos = self._fetch_from_rss()
        except Exception as e:
            logger.error(f"Unexpected error fetching from API: {e}")
            videos = self._fetch_from_rss()
        
        # Filter out already processed videos
        new_videos = [v for v in videos if v.id not in processed_ids]
        
        # Sort by publish date (newest first)
        new_videos.sort(
            key=lambda v: datetime.fromisoformat(v.published_at.replace('Z', '+00:00')),
            reverse=True
        )
        
        logger.info(f"Found {len(new_videos)} new videos out of {len(videos)} total")
        
        return new_videos
    
    def enrich_video_details(self, video: VideoInfo) -> VideoInfo:
        """
        Enrich video details if fetched from RSS (which lacks some fields).
        """
        if video.source == 'api':
            return video
        
        # Fetch missing details from API
        try:
            if self.youtube:
                response = self.youtube.videos().list(
                    part='contentDetails,statistics',
                    id=video.id
                ).execute()
                
                if response.get('items'):
                    item = response['items'][0]
                    content_details = item.get('contentDetails', {})
                    statistics = item.get('statistics', {})
                    
                    video.duration = content_details.get('duration', '')
                    video.view_count = int(statistics.get('viewCount', 0))
                    video.like_count = int(statistics.get('likeCount', 0))
                    video.comment_count = int(statistics.get('commentCount', 0))
                    
                    # Update is_short detection with actual duration
                    duration_seconds = self._parse_iso_duration(video.duration)
                    video.is_short = self._is_short(video.title, duration_seconds)
                    
                    logger.info(f"Enriched details for video {video.id}")
                    
        except Exception as e:
            logger.warning(f"Failed to enrich video {video.id}: {e}")
        
        return video
