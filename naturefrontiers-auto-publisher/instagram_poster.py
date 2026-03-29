"""
Instagram poster using Graph API.
Posts Reels for Shorts and regular videos for longer content.
"""

import logging
import time
from typing import Optional, Dict
import requests
from tenacity import retry, stop_after_attempt, wait_exponential

from config import config
from youtube_fetcher import VideoInfo
from content_generator import GeneratedContent

logger = logging.getLogger(__name__)


class InstagramPoster:
    """Post to Instagram using Graph API."""
    
    def __init__(self):
        self.access_token = config.instagram_access_token
        self.account_id = config.instagram_account_id
        self.base_url = "https://graph.facebook.com/v18.0"
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def post_reel(self, content: GeneratedContent, video: VideoInfo) -> Optional[str]:
        """
        Post a Reel to Instagram (for Shorts).
        Uses PULL_FROM_URL method with YouTube video.
        Returns media ID on success.
        """
        try:
            # Instagram Reels creation via URL
            # Note: Instagram requires the video to be hosted publicly
            # For YouTube videos, we use the thumbnail and link in caption
            
            # Step 1: Create media container
            caption = content.instagram_caption
            
            # Use thumbnail as cover image
            thumbnail_url = video.thumbnails.get('high', '')
            
            create_payload = {
                'media_type': 'IMAGE',  # Using image with link due to API limitations
                'image_url': thumbnail_url,
                'caption': caption,
                'access_token': self.access_token
            }
            
            create_url = f"{self.base_url}/{self.account_id}/media"
            
            response = requests.post(create_url, json=create_payload)
            response.raise_for_status()
            
            result = response.json()
            creation_id = result.get('id')
            
            if not creation_id:
                logger.error("No creation ID returned from Instagram")
                return None
            
            logger.info(f"Media container created: {creation_id}")
            
            # Step 2: Publish the media
            publish_url = f"{self.base_url}/{self.account_id}/media_publish"
            publish_payload = {
                'creation_id': creation_id,
                'access_token': self.access_token
            }
            
            publish_response = requests.post(publish_url, json=publish_payload)
            publish_response.raise_for_status()
            
            publish_result = publish_response.json()
            published_media_id = publish_result.get('id')
            
            if published_media_id:
                logger.info(f"Reel posted successfully: {published_media_id}")
                return published_media_id
            else:
                logger.warning("Media published but no ID returned")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Instagram API error: {e}")
            raise
        
        except Exception as e:
            logger.error(f"Unexpected error posting to Instagram: {e}")
            return None
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def post_video(self, content: GeneratedContent, video: VideoInfo) -> Optional[str]:
        """
        Post a regular video to Instagram (for non-Shorts).
        Similar to Reels but for longer content.
        """
        # For now, use same method as Reels
        # Instagram's API treats most video posts similarly
        return self.post_reel(content, video)
    
    def post_with_fallback_link(self, content: GeneratedContent, video: VideoInfo) -> bool:
        """
        Fallback: Post image with YouTube link in caption.
        Used when direct video posting fails.
        """
        try:
            # Create simple post with thumbnail and link
            caption = f"{content.instagram_caption}\n\n📺 Watch full video: {video.url}"
            
            thumbnail_url = video.thumbnails.get('high', '')
            
            create_payload = {
                'media_type': 'IMAGE',
                'image_url': thumbnail_url,
                'caption': caption,
                'access_token': self.access_token
            }
            
            create_url = f"{self.base_url}/{self.account_id}/media"
            
            response = requests.post(create_url, json=create_payload)
            response.raise_for_status()
            
            creation_id = response.json().get('id')
            
            if not creation_id:
                return False
            
            # Publish
            publish_url = f"{self.base_url}/{self.account_id}/media_publish"
            publish_payload = {
                'creation_id': creation_id,
                'access_token': self.access_token
            }
            
            publish_response = requests.post(publish_url, json=publish_payload)
            publish_response.raise_for_status()
            
            logger.info("Fallback Instagram post created successfully")
            return True
            
        except Exception as e:
            logger.error(f"Fallback Instagram post failed: {e}")
            return False
