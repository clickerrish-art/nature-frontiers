#!/usr/bin/env python3
"""
Nature Frontiers Auto Publisher - Main Entry Point

Automatically detects new YouTube videos and cross-posts to multiple platforms
with AI-generated content.

Usage:
    python main.py [--dry-run] [--single-video VIDEO_ID]
"""

import os
import sys
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Set, List, Dict
import xml.etree.ElementTree as ET
from xml.dom import minidom

# Configure logging
log_dir = Path("logs")
log_dir.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_dir / "app.log"),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

# Import application modules
from config import config
from youtube_fetcher import YouTubeFetcher, VideoInfo
from content_generator import ContentGenerator, GeneratedContent
from social_poster import SocialMediaPoster, PostResult


class StateManager:
    """Manage state of processed videos."""
    
    def __init__(self, state_file: Path):
        self.state_file = state_file
        self.processed_ids: Set[str] = self._load_state()
    
    def _load_state(self) -> Set[str]:
        """Load previously processed video IDs."""
        if not self.state_file.exists():
            return set()
        
        try:
            with open(self.state_file, 'r') as f:
                ids = {line.strip() for line in f if line.strip()}
            logger.info(f"Loaded {len(ids)} processed video IDs from state file")
            return ids
        except Exception as e:
            logger.error(f"Error loading state file: {e}")
            return set()
    
    def save_state(self):
        """Save current state to file."""
        try:
            with open(self.state_file, 'w') as f:
                for video_id in sorted(self.processed_ids):
                    f.write(f"{video_id}\n")
            logger.info(f"Saved {len(self.processed_ids)} video IDs to state file")
        except Exception as e:
            logger.error(f"Error saving state file: {e}")
    
    def add_processed(self, video_id: str):
        """Mark a video as processed."""
        self.processed_ids.add(video_id)
    
    def is_processed(self, video_id: str) -> bool:
        """Check if a video has been processed."""
        return video_id in self.processed_ids


class OutputManager:
    """Manage output files (RSS, JSON, blog posts)."""
    
    def __init__(self, output_dir: Path):
        self.output_dir = output_dir
        self.posts_dir = output_dir / "posts"
        self.posts_dir.mkdir(parents=True, exist_ok=True)
        
        # Load existing videos for JSON
        self.videos_json_path = output_dir / "latest-videos.json"
        self.existing_videos = self._load_existing_videos()
    
    def _load_existing_videos(self) -> List[Dict]:
        """Load existing videos from JSON file."""
        if not self.videos_json_path.exists():
            return []
        
        try:
            with open(self.videos_json_path, 'r') as f:
                data = json.load(f)
                return data.get('videos', [])
        except Exception as e:
            logger.error(f"Error loading existing videos: {e}")
            return []
    
    def save_video_json(self, video: VideoInfo, content: GeneratedContent):
        """Update latest-videos.json with new video."""
        video_data = {
            'id': video.id,
            'title': content.short_title,
            'description': video.description[:500],
            'url': video.url,
            'thumbnail': video.thumbnails.get('high', ''),
            'published_at': video.published_at,
            'is_short': video.is_short,
            'view_count': video.view_count,
            'channel_title': video.channel_title
        }
        
        # Add to beginning of list
        self.existing_videos.insert(0, video_data)
        
        # Keep only latest 10 videos
        self.existing_videos = self.existing_videos[:10]
        
        # Save to file
        output_data = {
            'updated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
            'total_videos': len(self.existing_videos),
            'videos': self.existing_videos
        }
        
        with open(self.videos_json_path, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        logger.info(f"Updated {self.videos_json_path}")
    
    def save_blog_post(self, video: VideoInfo, content: GeneratedContent):
        """Save blog post as Markdown file."""
        filename = f"{video.id}.md"
        filepath = self.posts_dir / filename
        
        with open(filepath, 'w') as f:
            f.write(content.blog_markdown)
        
        logger.info(f"Saved blog post: {filepath}")
    
    def update_rss_feed(self, video: VideoInfo, content: GeneratedContent):
        """Update Atom RSS feed with new video."""
        rss_path = self.output_dir / "atom.xml"
        
        # Create or load existing feed
        if rss_path.exists():
            tree = ET.parse(rss_path)
            root = tree.getroot()
            ns = {'atom': 'http://www.w3.org/2005/Atom'}
            feed_elem = root.find('atom:feed', ns) or root
        else:
            # Create new feed
            root = ET.Element('{http://www.w3.org/2005/Atom}feed')
            feed_elem = root
            
            # Add feed metadata
            title = ET.SubElement(feed_elem, '{http://www.w3.org/2005/Atom}title')
            title.text = "Nature Frontiers - Latest Videos"
            
            subtitle = ET.SubElement(feed_elem, '{http://www.w3.org/2005/Atom}subtitle')
            subtitle.text = "Latest nature and wildlife videos from Nature Frontiers"
            
            link = ET.SubElement(feed_elem, '{http://www.w3.org/2005/Atom}link')
            link.set('href', 'https://www.youtube.com/channel/' + video.channel_id)
            
            updated = ET.SubElement(feed_elem, '{http://www.w3.org/2005/Atom}updated')
            updated.text = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
            
            author = ET.SubElement(feed_elem, '{http://www.w3.org/2005/Atom}author')
            author_name = ET.SubElement(author, '{http://www.w3.org/2005/Atom}name')
            author_name.text = video.channel_title
        
        # Create new entry
        entry = ET.SubElement(feed_elem, '{http://www.w3.org/2005/Atom}entry')
        
        title = ET.SubElement(entry, '{http://www.w3.org/2005/Atom}title')
        title.text = content.short_title
        
        link = ET.SubElement(entry, '{http://www.w3.org/2005/Atom}link')
        link.set('href', video.url)
        
        entry_id = ET.SubElement(entry, '{http://www.w3.org/2005/Atom}id')
        entry_id.text = f"yt:video:{video.id}"
        
        published = ET.SubElement(entry, '{http://www.w3.org/2005/Atom}published')
        published.text = video.published_at
        
        updated = ET.SubElement(entry, '{http://www.w3.org/2005/Atom}updated')
        updated.text = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
        
        summary = ET.SubElement(entry, '{http://www.w3.org/2005/Atom}summary')
        summary.text = video.description[:500] if video.description else ""
        
        # Add media group for thumbnail
        media_thumbnail = ET.SubElement(entry, '{http://search.yahoo.com/mrss/}thumbnail')
        media_thumbnail.set('url', video.thumbnails.get('high', ''))
        
        # Pretty print and save
        xml_str = ET.tostring(root, encoding='unicode')
        dom = minidom.parseString(xml_str)
        pretty_xml = dom.toprettyxml(indent="  ")
        
        # Remove extra blank lines
        pretty_xml = '\n'.join([line for line in pretty_xml.split('\n') if line.strip()])
        
        with open(rss_path, 'w') as f:
            f.write(pretty_xml)
        
        logger.info(f"Updated RSS feed: {rss_path}")


def process_video(
    video: VideoInfo,
    generator: ContentGenerator,
    poster: SocialMediaPoster,
    output_mgr: OutputManager,
    dry_run: bool = False
) -> Dict:
    """Process a single video: generate content, post, and save outputs."""
    
    logger.info(f"\n{'='*60}")
    logger.info(f"Processing video: {video.title}")
    logger.info(f"Video ID: {video.id}")
    logger.info(f"Is Short: {video.is_short}")
    logger.info(f"{'='*60}")
    
    result = {
        'video_id': video.id,
        'video_title': video.title,
        'is_short': video.is_short,
        'content_generated': False,
        'posts': {},
        'outputs_saved': False
    }
    
    try:
        # Step 1: Generate AI content
        logger.info("Step 1: Generating AI content...")
        content = generator.generate_all_content(video)
        
        if not content:
            logger.error("Failed to generate content")
            result['error'] = "Content generation failed"
            return result
        
        result['content_generated'] = True
        logger.info(f"Generated short title: {content.short_title}")
        
        if dry_run:
            logger.info("[DRY RUN] Skipping social media posting")
            result['posts'] = {'dry_run': True}
        else:
            # Step 2: Post to social media
            logger.info("Step 2: Posting to social media platforms...")
            post_results = poster.post_to_all(content, video)
            
            for platform, post_result in post_results.items():
                result['posts'][platform] = {
                    'success': post_result.success,
                    'post_id': post_result.post_id,
                    'used_fallback': post_result.used_fallback,
                    'error': post_result.error_message
                }
                
                status = "✓" if post_result.success else "✗"
                fallback_note = " (fallback)" if post_result.used_fallback else ""
                logger.info(f"  {status} {platform}: {post_result.post_id or 'N/A'}{fallback_note}")
        
        # Step 3: Save outputs (always do this, even in dry run for testing)
        logger.info("Step 3: Saving outputs...")
        output_mgr.save_video_json(video, content)
        output_mgr.save_blog_post(video, content)
        output_mgr.update_rss_feed(video, content)
        result['outputs_saved'] = True
        
        logger.info(f"Successfully processed video: {video.id}")
        
    except Exception as e:
        logger.error(f"Error processing video {video.id}: {e}", exc_info=True)
        result['error'] = str(e)
    
    return result


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Nature Frontiers Auto Publisher')
    parser.add_argument('--dry-run', action='store_true', help='Skip actual posting')
    parser.add_argument('--single-video', type=str, help='Process a specific video ID')
    args = parser.parse_args()
    
    logger.info("="*60)
    logger.info("Nature Frontiers Auto Publisher Starting")
    logger.info("="*60)
    
    # Initialize components
    try:
        state_mgr = StateManager(config.state_file)
        fetcher = YouTubeFetcher()
        generator = ContentGenerator()
        poster = SocialMediaPoster()
        output_mgr = OutputManager(config.output_dir)
    except Exception as e:
        logger.error(f"Failed to initialize components: {e}")
        sys.exit(1)
    
    results = []
    
    try:
        if args.single_video:
            # Process a specific video (for testing)
            logger.info(f"Processing single video: {args.single_video}")
            # This would require fetching the specific video details
            # For now, just log it
            logger.warning("Single video processing not fully implemented")
        else:
            # Normal operation: fetch new videos
            logger.info("Fetching new videos from YouTube...")
            new_videos = fetcher.get_new_videos(state_mgr.processed_ids)
            
            if not new_videos:
                logger.info("No new videos found")
                return
            
            logger.info(f"Found {len(new_videos)} new video(s) to process")
            
            # Process each new video
            for video in new_videos:
                # Enrich video details if needed
                if video.source == 'rss':
                    video = fetcher.enrich_video_details(video)
                
                result = process_video(
                    video,
                    generator,
                    poster,
                    output_mgr,
                    dry_run=args.dry_run
                )
                results.append(result)
                
                # Mark as processed
                if not result.get('error'):
                    state_mgr.add_processed(video.id)
            
            # Save state
            state_mgr.save_state()
        
        # Summary
        logger.info("\n" + "="*60)
        logger.info("EXECUTION SUMMARY")
        logger.info("="*60)
        
        total = len(results)
        successful = sum(1 for r in results if not r.get('error'))
        
        logger.info(f"Videos processed: {total}")
        logger.info(f"Successful: {successful}")
        logger.info(f"Failed: {total - successful}")
        
        if results:
            logger.info("\nDetailed Results:")
            for result in results:
                status = "✓" if not result.get('error') else "✗"
                logger.info(f"  {status} {result['video_id']}: {result['video_title'][:50]}")
                
                if result.get('posts') and not args.dry_run:
                    for platform, post_info in result['posts'].items():
                        if isinstance(post_info, dict):
                            p_status = "✓" if post_info.get('success') else "✗"
                            logger.info(f"      {p_status} {platform}")
        
        logger.info("="*60)
        logger.info("Nature Frontiers Auto Publisher Complete")
        logger.info("="*60)
        
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
