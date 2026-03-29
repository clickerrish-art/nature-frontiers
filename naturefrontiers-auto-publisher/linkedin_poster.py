"""
LinkedIn poster using Community Management and Videos API.
Supports link posts (default) and native video upload (advanced).
API Version: 202602 (February 2026)
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


class LinkedInPoster:
    """Post to LinkedIn using REST API."""
    
    def __init__(self):
        self.access_token = config.linkedin_access_token
        self.person_urn = config.linkedin_person_urn
        self.organization_urn = config.linkedin_organization_urn
        self.post_mode = config.linkedin_post_mode  # 'link' or 'native'
        
        self.base_url = "https://api.linkedin.com/v2"
        self.headers = {
            'Authorization': f'Bearer {self.access_token}',
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json',
            'Linkedin-Version': '202602'  # February 2026 API version
        }
    
    def _get_author_urn(self) -> Optional[str]:
        """Get the appropriate author URN for posting."""
        return config.get_linkedin_author_urn()
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def post_link_with_thumbnail(self, content: GeneratedContent, video: VideoInfo) -> Optional[str]:
        """
        Post a rich text post with YouTube link and thumbnail.
        This is the default, safer method.
        Returns activity URN on success.
        """
        try:
            author_urn = self._get_author_urn()
            
            if not author_urn:
                logger.error("No LinkedIn author URN configured")
                return None
            
            # Prepare the post content
            caption = content.linkedin_caption
            
            # Create the post payload
            payload = {
                "author": author_urn,
                "lifecycleState": "PUBLISHED",
                "specificContent": {
                    "com.linkedin.ugc.ShareContent": {
                        "shareCommentary": {
                            "text": caption
                        },
                        "shareMediaCategory": "NONE",  # Link preview will be auto-generated
                        "media": []
                    }
                },
                "visibility": {
                    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
                }
            }
            
            # Add YouTube URL in the commentary
            full_text = f"{caption}\n\n📺 Watch on YouTube: {video.url}"
            payload["specificContent"]["com.linkedin.ugc.ShareContent"]["shareCommentary"]["text"] = full_text
            
            # Post to LinkedIn
            response = requests.post(
                f"{self.base_url}/ugcPosts",
                json=payload,
                headers=self.headers
            )
            
            if response.status_code == 201:
                result = response.json()
                activity_urn = result.get('id') or result.get('activity')
                
                if activity_urn:
                    logger.info(f"LinkedIn post created successfully: {activity_urn}")
                    return activity_urn
                else:
                    logger.warning("LinkedIn post created but no URN returned")
                    return None
            else:
                logger.error(f"LinkedIn API error ({response.status_code}): {response.text}")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f"LinkedIn API request failed: {e}")
            raise
        
        except Exception as e:
            logger.error(f"Unexpected error posting to LinkedIn: {e}")
            return None
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def post_native_video(self, content: GeneratedContent, video: VideoInfo) -> Optional[str]:
        """
        Upload video natively to LinkedIn and create a post.
        Advanced method requiring special permissions.
        Process: initializeUpload → upload → finalizeUpload → create post
        """
        try:
            author_urn = self._get_author_urn()
            
            if not author_urn:
                logger.error("No LinkedIn author URN configured")
                return None
            
            # Step 1: Initialize upload session
            init_payload = {
                "initializeUploadRequest": {
                    "owner": author_urn,
                    "fileSizeBytes": 0,  # Will be updated
                    "uploadCaptions": False,
                    "uploadThumbnail": True
                }
            }
            
            init_response = requests.post(
                f"{self.base_url}/videos?action=initializeUpload",
                json=init_payload,
                headers=self.headers
            )
            
            if init_response.status_code != 201:
                logger.error(f"Failed to initialize LinkedIn video upload: {init_response.text}")
                return None
            
            init_result = init_response.json()
            upload_url = init_result.get('value', {}).get('uploadUrl')
            video_urn = init_result.get('value', {}).get('video')
            
            if not upload_url or not video_urn:
                logger.error("Missing upload URL or video URN from initialization")
                return None
            
            logger.info(f"LinkedIn upload initialized: {video_urn}")
            
            # Note: Actual chunked upload would go here
            # For now, we'll skip to creating a post with the video URN
            # In production, you'd download the video and upload in chunks
            
            # Step 2: Finalize upload (simulated)
            finalize_payload = {
                "finalizeUploadRequest": {
                    "video": video_urn,
                    "captureUploadMode": "COMPLETE"
                }
            }
            
            finalize_response = requests.post(
                f"{self.base_url}/videos?action=finalizeUpload",
                json=finalize_payload,
                headers=self.headers
            )
            
            # Step 3: Create post with video
            caption = content.linkedin_caption
            full_text = f"{caption}\n\n🎬 New from Nature Frontiers"
            
            post_payload = {
                "author": author_urn,
                "lifecycleState": "PUBLISHED",
                "specificContent": {
                    "com.linkedin.ugc.ShareContent": {
                        "shareCommentary": {
                            "text": full_text
                        },
                        "shareMediaCategory": "VIDEO",
                        "media": [
                            {
                                "status": "READY",
                                "description": {
                                    "text": video.description[:256] if video.description else ""
                                },
                                "originalUrl": video.url,
                                "title": {
                                    "text": content.short_title
                                },
                                "content": {
                                    "com.linkedin.digitalmedia.VideoContext": {
                                        "video": video_urn,
                                        "thumbnail": video.thumbnails.get('high', '')
                                    }
                                },
                                "mediaCategory": "VIDEO"
                            }
                        ]
                    }
                },
                "visibility": {
                    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
                }
            }
            
            post_response = requests.post(
                f"{self.base_url}/ugcPosts",
                json=post_payload,
                headers=self.headers
            )
            
            if post_response.status_code == 201:
                result = post_response.json()
                activity_urn = result.get('id') or result.get('activity')
                
                if activity_urn:
                    logger.info(f"LinkedIn native video post created: {activity_urn}")
                    return activity_urn
            
            logger.error(f"LinkedIn native video post failed: {post_response.text}")
            return None
            
        except requests.exceptions.RequestException as e:
            logger.error(f"LinkedIn native video upload failed: {e}")
            return None
        
        except Exception as e:
            logger.error(f"Unexpected error in LinkedIn native upload: {e}")
            return None
    
    def post(self, content: GeneratedContent, video: VideoInfo) -> Optional[str]:
        """
        Post to LinkedIn using configured mode.
        Falls back to link post if native upload fails.
        """
        if self.post_mode == 'native':
            logger.info("Attempting native video upload to LinkedIn")
            post_id = self.post_native_video(content, video)
            
            if post_id:
                return post_id
            
            # Fallback to link post
            logger.info("Native upload failed, falling back to link post")
            return self.post_link_with_thumbnail(content, video)
        else:
            # Default: link post
            return self.post_link_with_thumbnail(content, video)
