"""
TikTok poster using Content Posting API.
Supports PULL_FROM_URL (preferred) and FILE_UPLOAD fallback.
"""

import logging
import os
import subprocess
from typing import Optional
import requests
from tenacity import retry, stop_after_attempt, wait_exponential

from config import config
from youtube_fetcher import VideoInfo
from content_generator import GeneratedContent

logger = logging.getLogger(__name__)


class TikTokPoster:
    """Post to TikTok using Content Posting API."""
    
    def __init__(self):
        self.access_token = config.tiktok_access_token
        self.base_url = "https://open.tiktokapis.com/v2/post"
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def post_video_url(self, content: GeneratedContent, video: VideoInfo) -> Optional[str]:
        """
        Post to TikTok using PULL_FROM_URL method.
        Preferred method as it doesn't require downloading the video.
        Returns post ID on success.
        """
        try:
            # TikTok Direct Post API endpoint
            url = f"{self.base_url}/publish/video/url"
            
            headers = {
                'Authorization': f'Bearer {self.access_token}',
                'Content-Type': 'application/json; charset=UTF-8'
            }
            
            # Prepare caption with hashtags
            caption = content.tiktok_caption
            
            # Extract hashtags from caption
            import re
            hashtags = re.findall(r'#\w+', caption)
            
            payload = {
                "post_info": {
                    "title": caption[:150],  # TikTok title limit
                    "privacy_level": ["PUBLIC_TO_EVERYONE"],
                    "disable_duet": False,
                    "disable_comment": False,
                    "disable_stitch": False
                },
                "source_info": {
                    "source": "PULL_FROM_URL",
                    "video_url": video.url,  # YouTube URL
                    "video_cover_url": video.thumbnails.get('high', '')
                }
            }
            
            response = requests.post(url, json=payload, headers=headers)
            
            if response.status_code == 200:
                result = response.json()
                post_id = result.get('data', {}).get('post_id')
                
                if post_id:
                    logger.info(f"TikTok post created successfully: {post_id}")
                    return post_id
                else:
                    logger.warning("TikTok post created but no ID returned")
                    return None
            else:
                logger.error(f"TikTok API error ({response.status_code}): {response.text}")
                
                # Check if we should fallback to FILE_UPLOAD
                if response.status_code in [400, 422]:
                    logger.info("PULL_FROM_URL failed, may need FILE_UPLOAD fallback")
                
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f"TikTok API request failed: {e}")
            raise
        
        except Exception as e:
            logger.error(f"Unexpected error posting to TikTok: {e}")
            return None
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def post_video_file(self, content: GeneratedContent, video: VideoInfo) -> Optional[str]:
        """
        Fallback: Download video and upload via FILE_UPLOAD.
        Slower but more reliable for some cases.
        """
        temp_file = None
        
        try:
            # Download video using yt-dlp
            temp_file = self._download_video(video.id)
            
            if not temp_file or not os.path.exists(temp_file):
                logger.error("Failed to download video for TikTok upload")
                return None
            
            # Upload file to TikTok
            url = f"{self.base_url}/publish/video/upload"
            
            headers = {
                'Authorization': f'Bearer {self.access_token}',
            }
            
            # First, initialize upload
            init_payload = {
                "post_info": {
                    "title": content.tiktok_caption[:150],
                    "privacy_level": ["PUBLIC_TO_EVERYONE"],
                    "disable_duet": False,
                    "disable_comment": False,
                    "disable_stitch": False
                }
            }
            
            # Get upload URL
            init_response = requests.post(
                f"{self.base_url}/upload/url",
                json={**init_payload, "file_size": os.path.getsize(temp_file)},
                headers=headers
            )
            
            if init_response.status_code != 200:
                logger.error(f"Failed to get upload URL: {init_response.text}")
                return None
            
            upload_info = init_response.json().get('data', {})
            upload_url = upload_info.get('upload_url')
            
            # Upload the actual file
            with open(temp_file, 'rb') as f:
                upload_response = requests.put(upload_url, data=f)
            
            if upload_response.status_code == 200:
                # Finalize and publish
                finalize_response = requests.post(
                    f"{self.base_url}/publish/video/initiate",
                    json={"upload_id": upload_info.get('upload_id')},
                    headers=headers
                )
                
                if finalize_response.status_code == 200:
                    post_id = finalize_response.json().get('data', {}).get('post_id')
                    logger.info(f"TikTok file upload successful: {post_id}")
                    return post_id
            
            logger.error("TikTok file upload failed")
            return None
            
        except Exception as e:
            logger.error(f"Error in TikTok file upload: {e}")
            return None
        
        finally:
            # Clean up temp file
            if temp_file and os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except:
                    pass
    
    def _download_video(self, video_id: str) -> Optional[str]:
        """Download YouTube video using yt-dlp."""
        try:
            output_template = f"/tmp/tiktok_upload_{video_id}.mp4"
            
            cmd = [
                'yt-dlp',
                '-f', 'best[ext=mp4]',
                '--max-filesize', '100M',  # Limit file size
                '-o', output_template,
                f'https://www.youtube.com/watch?v={video_id}'
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            
            if result.returncode == 0 and os.path.exists(output_template):
                return output_template
            else:
                logger.error(f"yt-dlp failed: {result.stderr}")
                return None
                
        except subprocess.TimeoutExpired:
            logger.error("Video download timed out")
            return None
        except Exception as e:
            logger.error(f"Error downloading video: {e}")
            return None
    
    def post_with_fallback(self, content: GeneratedContent, video: VideoInfo) -> Optional[str]:
        """
        Try PULL_FROM_URL first, fallback to FILE_UPLOAD if needed.
        """
        # Try URL method first
        post_id = self.post_video_url(content, video)
        
        if post_id:
            return post_id
        
        # Fallback to file upload
        logger.info("Falling back to FILE_UPLOAD method for TikTok")
        return self.post_video_file(content, video)
