"""
Configuration management for Nature Frontiers Auto Publisher.
Loads environment variables and provides validated configuration.
"""

import os
from pathlib import Path
from typing import List, Optional
from dotenv import load_dotenv

# Load .env file
load_dotenv()


class Config:
    """Centralized configuration management."""
    
    def __init__(self):
        # YouTube Configuration
        self.youtube_api_key = self._get_required("YOUTUBE_API_KEY")
        self.youtube_channel_id = os.getenv(
            "YOUTUBE_CHANNEL_ID", "UC41xXhw22o6Q2I2pTKB2kOg"
        )
        self.youtube_playlists = self._parse_playlists()
        
        # Qwen/DashScope Configuration
        self.dashscope_api_key = self._get_required("DASHSCOPE_API_KEY")
        self.qwen_model = os.getenv("QWEN_MODEL", "qwen-plus")
        self.max_title_length = int(os.getenv("MAX_TITLE_LENGTH", "100"))
        
        # Twitter/X Configuration
        self.twitter_api_key = os.getenv("TWITTER_API_KEY")
        self.twitter_api_secret = os.getenv("TWITTER_API_SECRET")
        self.twitter_access_token = os.getenv("TWITTER_ACCESS_TOKEN")
        self.twitter_access_token_secret = os.getenv("TWITTER_ACCESS_TOKEN_SECRET")
        self.twitter_bearer_token = os.getenv("TWITTER_BEARER_TOKEN")
        self.twitter_enabled = os.getenv("ENABLE_TWITTER", "false").lower() == "true"
        
        # Instagram Configuration
        self.instagram_access_token = os.getenv("INSTAGRAM_ACCESS_TOKEN")
        self.instagram_account_id = os.getenv("INSTAGRAM_ACCOUNT_ID")
        self.instagram_enabled = os.getenv("ENABLE_INSTAGRAM", "false").lower() == "true"
        
        # TikTok Configuration
        self.tiktok_access_token = os.getenv("TIKTOK_ACCESS_TOKEN")
        self.tiktok_enabled = os.getenv("ENABLE_TIKTOK", "false").lower() == "true"
        
        # LinkedIn Configuration
        self.linkedin_access_token = os.getenv("LINKEDIN_ACCESS_TOKEN")
        self.linkedin_person_urn = os.getenv("LINKEDIN_PERSON_URN")
        self.linkedin_organization_urn = os.getenv("LINKEDIN_ORGANIZATION_URN")
        self.linkedin_post_mode = os.getenv("LINKEDIN_POST_MODE", "link").lower()
        self.linkedin_enabled = os.getenv("ENABLE_LINKEDIN", "false").lower() == "true"
        
        # Logging
        self.log_level = os.getenv("LOG_LEVEL", "INFO").upper()
        
        # Output
        self.output_dir = Path(os.getenv("OUTPUT_DIR", "output"))
        self.state_file = Path(os.getenv("STATE_FILE", "processed_videos.txt"))
        
        # Ensure output directories exist
        self.output_dir.mkdir(parents=True, exist_ok=True)
        (self.output_dir / "posts").mkdir(parents=True, exist_ok=True)
        
    def _get_required(self, key: str) -> str:
        """Get required environment variable or raise error."""
        value = os.getenv(key)
        if not value:
            raise ValueError(f"Required environment variable {key} is not set")
        return value
    
    def _parse_playlists(self) -> List[str]:
        """Parse comma-separated playlist IDs."""
        playlists_str = os.getenv("YOUTUBE_PLAYLISTS", "")
        if not playlists_str:
            return []
        return [p.strip() for p in playlists_str.split(",")]
    
    @property
    def twitter_configured(self) -> bool:
        """Check if Twitter is fully configured."""
        return all([
            self.twitter_enabled,
            self.twitter_api_key,
            self.twitter_api_secret,
            self.twitter_access_token,
            self.twitter_access_token_secret
        ])
    
    @property
    def instagram_configured(self) -> bool:
        """Check if Instagram is fully configured."""
        return all([
            self.instagram_enabled,
            self.instagram_access_token,
            self.instagram_account_id
        ])
    
    @property
    def tiktok_configured(self) -> bool:
        """Check if TikTok is fully configured."""
        return all([
            self.tiktok_enabled,
            self.tiktok_access_token
        ])
    
    @property
    def linkedin_configured(self) -> bool:
        """Check if LinkedIn is fully configured."""
        has_auth = self.linkedin_access_token and (
            self.linkedin_person_urn or self.linkedin_organization_urn
        )
        return all([
            self.linkedin_enabled,
            has_auth
        ])
    
    def get_linkedin_author_urn(self) -> Optional[str]:
        """Get the appropriate LinkedIn author URN."""
        if self.linkedin_organization_urn:
            return self.linkedin_organization_urn
        return self.linkedin_person_urn


# Global config instance
config = Config()
