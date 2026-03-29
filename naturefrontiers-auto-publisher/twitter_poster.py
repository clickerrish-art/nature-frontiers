"""
Twitter/X poster using Tweepy.
Posts tweets with optimized captions and YouTube links.
"""

import logging
from typing import Optional
import tweepy
from tenacity import retry, stop_after_attempt, wait_exponential

from config import config
from youtube_fetcher import VideoInfo
from content_generator import GeneratedContent

logger = logging.getLogger(__name__)


class TwitterPoster:
    """Post to Twitter/X using OAuth 2.0."""
    
    def __init__(self):
        self.api_key = config.twitter_api_key
        self.api_secret = config.twitter_api_secret
        self.access_token = config.twitter_access_token
        self.access_token_secret = config.twitter_access_token_secret
        self.bearer_token = config.twitter_bearer_token
        
        self.client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize Twitter API client."""
        try:
            self.client = tweepy.Client(
                bearer_token=self.bearer_token,
                consumer_key=self.api_key,
                consumer_secret=self.api_secret,
                access_token=self.access_token,
                access_token_secret=self.access_token_secret
            )
            logger.info("Twitter client initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Twitter client: {e}")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def post_tweet(self, content: GeneratedContent, video: VideoInfo) -> Optional[str]:
        """
        Post a tweet with the generated caption.
        Returns tweet ID on success, None on failure.
        """
        if not self.client:
            logger.error("Twitter client not initialized")
            return None
        
        try:
            # Use the generated Twitter caption
            tweet_text = content.twitter_caption
            
            # Ensure it's within Twitter's character limit
            if len(tweet_text) > 280:
                tweet_text = tweet_text[:277] + "..."
            
            # Post the tweet
            response = self.client.create_tweet(text=tweet_text)
            
            if response.data and 'id' in response.data:
                tweet_id = response.data['id']
                logger.info(f"Tweet posted successfully: {tweet_id}")
                return tweet_id
            else:
                logger.warning("Tweet posted but no ID returned")
                return None
                
        except tweepy.errors.TweepyException as e:
            logger.error(f"Twitter API error: {e}")
            raise  # Let retry handle it
        
        except Exception as e:
            logger.error(f"Unexpected error posting tweet: {e}")
            return None
    
    def post_thread(self, content: GeneratedContent, video: VideoInfo) -> Optional[list]:
        """
        Post a thread of tweets (optional feature for longer content).
        Currently just posts single tweet, but can be extended.
        """
        return [self.post_tweet(content, video)]
