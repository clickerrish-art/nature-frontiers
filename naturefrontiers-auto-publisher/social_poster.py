"""
Social media poster orchestrator.
Coordinates posting to all enabled platforms with error handling and fallbacks.
"""

import logging
from typing import Dict, Optional, Any
from dataclasses import dataclass

from config import config
from youtube_fetcher import VideoInfo
from content_generator import GeneratedContent
from twitter_poster import TwitterPoster
from instagram_poster import InstagramPoster
from tiktok_poster import TikTokPoster
from linkedin_poster import LinkedInPoster

logger = logging.getLogger(__name__)


@dataclass
class PostResult:
    """Result of posting to a platform."""
    platform: str
    success: bool
    post_id: Optional[str]
    error_message: Optional[str]
    used_fallback: bool = False


class SocialMediaPoster:
    """Orchestrate posting to multiple social media platforms."""
    
    def __init__(self):
        self.twitter_poster = TwitterPoster() if config.twitter_configured else None
        self.instagram_poster = InstagramPoster() if config.instagram_configured else None
        self.tiktok_poster = TikTokPoster() if config.tiktok_configured else None
        self.linkedin_poster = LinkedInPoster() if config.linkedin_configured else None
        
        logger.info("Social media posters initialized")
    
    def post_to_all(self, content: GeneratedContent, video: VideoInfo) -> Dict[str, PostResult]:
        """
        Post to all enabled platforms.
        Returns results for each platform.
        """
        results = {}
        
        # Twitter
        if self.twitter_poster:
            results['twitter'] = self._post_twitter(content, video)
        else:
            logger.info("Twitter posting disabled or not configured")
        
        # Instagram
        if self.instagram_poster:
            results['instagram'] = self._post_instagram(content, video)
        else:
            logger.info("Instagram posting disabled or not configured")
        
        # TikTok
        if self.tiktok_poster:
            results['tiktok'] = self._post_tiktok(content, video)
        else:
            logger.info("TikTok posting disabled or not configured")
        
        # LinkedIn
        if self.linkedin_poster:
            results['linkedin'] = self._post_linkedin(content, video)
        else:
            logger.info("LinkedIn posting disabled or not configured")
        
        # Log summary
        successful = sum(1 for r in results.values() if r.success)
        total = len(results)
        logger.info(f"Posting complete: {successful}/{total} platforms successful")
        
        return results
    
    def _post_twitter(self, content: GeneratedContent, video: VideoInfo) -> PostResult:
        """Post to Twitter with error handling."""
        try:
            post_id = self.twitter_poster.post_tweet(content, video)
            
            if post_id:
                return PostResult(
                    platform='twitter',
                    success=True,
                    post_id=post_id,
                    error_message=None
                )
            else:
                return PostResult(
                    platform='twitter',
                    success=False,
                    post_id=None,
                    error_message='No post ID returned'
                )
                
        except Exception as e:
            logger.error(f"Twitter posting failed: {e}")
            return PostResult(
                platform='twitter',
                success=False,
                post_id=None,
                error_message=str(e)
            )
    
    def _post_instagram(self, content: GeneratedContent, video: VideoInfo) -> PostResult:
        """Post to Instagram with fallback."""
        used_fallback = False
        
        try:
            # Try regular post first
            if video.is_short:
                post_id = self.instagram_poster.post_reel(content, video)
            else:
                post_id = self.instagram_poster.post_video(content, video)
            
            if not post_id:
                # Try fallback
                logger.info("Attempting Instagram fallback (link post)")
                success = self.instagram_poster.post_with_fallback_link(content, video)
                used_fallback = True
                
                if success:
                    return PostResult(
                        platform='instagram',
                        success=True,
                        post_id='fallback',
                        error_message=None,
                        used_fallback=True
                    )
            
            if post_id:
                return PostResult(
                    platform='instagram',
                    success=True,
                    post_id=post_id,
                    error_message=None
                )
            else:
                return PostResult(
                    platform='instagram',
                    success=False,
                    post_id=None,
                    error_message='No post ID returned'
                )
                
        except Exception as e:
            logger.error(f"Instagram posting failed: {e}")
            return PostResult(
                platform='instagram',
                success=False,
                post_id=None,
                error_message=str(e)
            )
    
    def _post_tiktok(self, content: GeneratedContent, video: VideoInfo) -> PostResult:
        """Post to TikTok with automatic fallback."""
        try:
            post_id = self.tiktok_poster.post_with_fallback(content, video)
            
            if post_id:
                return PostResult(
                    platform='tiktok',
                    success=True,
                    post_id=post_id,
                    error_message=None
                )
            else:
                return PostResult(
                    platform='tiktok',
                    success=False,
                    post_id=None,
                    error_message='No post ID returned from any method'
                )
                
        except Exception as e:
            logger.error(f"TikTok posting failed: {e}")
            return PostResult(
                platform='tiktok',
                success=False,
                post_id=None,
                error_message=str(e)
            )
    
    def _post_linkedin(self, content: GeneratedContent, video: VideoInfo) -> PostResult:
        """Post to LinkedIn with mode-based approach."""
        try:
            post_id = self.linkedin_poster.post(content, video)
            
            if post_id:
                return PostResult(
                    platform='linkedin',
                    success=True,
                    post_id=post_id,
                    error_message=None
                )
            else:
                return PostResult(
                    platform='linkedin',
                    success=False,
                    post_id=None,
                    error_message='No post ID returned'
                )
                
        except Exception as e:
            logger.error(f"LinkedIn posting failed: {e}")
            return PostResult(
                platform='linkedin',
                success=False,
                post_id=None,
                error_message=str(e)
            )
