"""
Content generator using Qwen LLM via DashScope.
Creates platform-specific captions, titles, and blog posts.
"""

import logging
from typing import Dict, Optional
from dataclasses import dataclass
import dashscope
from dashscope import Generation

from config import config
from youtube_fetcher import VideoInfo

logger = logging.getLogger(__name__)


@dataclass
class GeneratedContent:
    """Generated content for all platforms."""
    short_title: str
    twitter_caption: str
    instagram_caption: str
    tiktok_caption: str
    linkedin_caption: str
    blog_markdown: str
    blog_html_embed: str
    hashtags: list[str]


class ContentGenerator:
    """Generate AI-powered content using Qwen LLM."""
    
    def __init__(self):
        self.api_key = config.dashscope_api_key
        self.model = config.qwen_model
        self.max_title_length = config.max_title_length
        
        # Set API key for DashScope
        dashscope.api_key = self.api_key
    
    def _build_prompt(self, video: VideoInfo, platform: str) -> str:
        """Build platform-specific prompt for Qwen."""
        
        base_info = f"""
Video Title: {video.title}
Description: {video.description[:500]}{'...' if len(video.description) > 500 else ''}
Tags: {', '.join(video.tags[:10]) if video.tags else 'Nature, Wildlife, Conservation'}
Duration: {video.duration}
Is Short: {'Yes' if video.is_short else 'No'}
Views: {video.view_count:,}
Channel: {video.channel_title}
"""
        
        prompts = {
            'short_title': f"""
{base_info}
Generate an optimized, engaging title (max {self.max_title_length} characters) for social media.
Make it punchy and click-worthy while staying true to the content.
Focus on nature/wildlife enthusiasts.
Return ONLY the title, nothing else.
""",
            
            'twitter': f"""
{base_info}
Generate a Twitter/X post caption for this nature video.
Requirements:
- Maximum 280 characters
- Punchy and engaging tone
- Include 2-3 relevant emojis
- Add 2-3 trending hashtags about nature/wildlife
- Include a call-to-action
- Mention it's from Nature Frontiers
Return ONLY the caption, nothing else.
""",
            
            'instagram': f"""
{base_info}
Generate an Instagram caption for this {"Reel" if video.is_short else "video"}.
Requirements:
- Engaging opening line with emoji
- 2-3 sentences describing the content
- Call-to-action (follow, like, comment)
- 8-12 relevant hashtags (mix of popular and niche)
- Nature/wildlife focused audience
- Friendly, inspiring tone
Return ONLY the caption, nothing else.
""",
            
            'tiktok': f"""
{base_info}
Generate a TikTok caption for this {"Short" if video.is_short else "video"}.
Requirements:
- Short, viral-style text (under 100 characters ideal)
- Trending TikTok style
- 3-5 trending hashtags (#nature, #wildlife, etc.)
- Hook viewers in first few words
- Gen-Z friendly but not cringe
Return ONLY the caption, nothing else.
""",
            
            'linkedin': f"""
{base_info}
Generate a LinkedIn post caption for this nature documentary video.
Requirements:
- Professional, educational tone
- 3-4 paragraphs
- Focus on conservation, education, or scientific value
- Include relevant industry insights if applicable
- Professional hashtags (3-5)
- Call-to-action for professional engagement
- Target: nature enthusiasts, educators, conservationists
Return ONLY the caption, nothing else.
""",
            
            'blog': f"""
{base_info}
Generate a complete blog post in Markdown format about this video.
Include:
- Catchy H1 title
- 2-3 paragraph introduction
- Key highlights section (bullet points)
- Interesting facts or context about the wildlife/nature shown
- YouTube embed code (use video ID: {video.id})
- Call-to-action to subscribe
- Relevant links section
- 3-5 SEO-friendly hashtags at the end

Format as proper Markdown with headers, lists, and embedded YouTube player.
"""
        }
        
        return prompts.get(platform, '')
    
    def _generate_with_qwen(self, prompt: str, max_tokens: int = 500) -> Optional[str]:
        """Generate text using Qwen LLM with retry logic."""
        try:
            response = Generation.call(
                model=self.model,
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=0.7,
                top_p=0.9
            )
            
            if response.status_code == 200:
                return response.output.text.strip()
            else:
                logger.error(f"Qwen API error: {response.code} - {response.message}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to generate content with Qwen: {e}")
            return None
    
    def generate_all_content(self, video: VideoInfo) -> Optional[GeneratedContent]:
        """Generate all platform-specific content for a video."""
        logger.info(f"Generating content for video: {video.title}")
        
        try:
            # Generate short title
            short_title = self._generate_with_qwen(
                self._build_prompt(video, 'short_title'),
                max_tokens=50
            )
            if not short_title:
                short_title = video.title[:self.max_title_length]
            
            # Generate platform captions
            twitter_caption = self._generate_with_qwen(
                self._build_prompt(video, 'twitter'),
                max_tokens=200
            )
            
            instagram_caption = self._generate_with_qwen(
                self._build_prompt(video, 'instagram'),
                max_tokens=400
            )
            
            tiktok_caption = self._generate_with_qwen(
                self._build_prompt(video, 'tiktok'),
                max_tokens=150
            )
            
            linkedin_caption = self._generate_with_qwen(
                self._build_prompt(video, 'linkedin'),
                max_tokens=600
            )
            
            # Generate blog post
            blog_markdown = self._generate_with_qwen(
                self._build_prompt(video, 'blog'),
                max_tokens=1500
            )
            
            # Extract hashtags from generated content
            hashtags = self._extract_hashtags([
                twitter_caption,
                instagram_caption,
                tiktok_caption,
                linkedin_caption
            ])
            
            # Generate HTML embed
            blog_html_embed = f"""
<div class="youtube-embed">
    <iframe width="560" height="315" 
            src="https://www.youtube.com/embed/{video.id}" 
            title="{short_title}" 
            frameborder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowfullscreen>
    </iframe>
</div>
"""
            
            # Fallbacks for failed generations
            if not twitter_caption:
                twitter_caption = f"🎬 {short_title}\n\nWatch now: {video.url}\n\n#Nature #Wildlife #NatureFrontiers"
            
            if not instagram_caption:
                instagram_caption = f"✨ {short_title}\n\n{video.description[:100]}...\n\n👆 Watch full video (link in bio)\n\n#NaturePhotography #Wildlife #NatureLovers #Conservation #NatureFrontiers #WildlifePhotography #Explore #Adventure #Earth #Animals"
            
            if not tiktok_caption:
                tiktok_caption = f"{short_title} 🌿 #nature #wildlife #fyp #viral #naturetok"
            
            if not linkedin_caption:
                linkedin_caption = f"Exciting new video from Nature Frontiers: {short_title}\n\nA fascinating look into the natural world. Perfect for nature enthusiasts and educators.\n\nWatch here: {video.url}\n\n#NatureDocumentary #Wildlife #Education #Conservation"
            
            if not blog_markdown:
                blog_markdown = self._generate_fallback_blog(video, short_title)
            
            content = GeneratedContent(
                short_title=short_title,
                twitter_caption=twitter_caption,
                instagram_caption=instagram_caption,
                tiktok_caption=tiktok_caption,
                linkedin_caption=linkedin_caption,
                blog_markdown=blog_markdown,
                blog_html_embed=blog_html_embed,
                hashtags=hashtags
            )
            
            logger.info("Content generation completed successfully")
            return content
            
        except Exception as e:
            logger.error(f"Error generating content: {e}")
            return self._generate_fallback_content(video)
    
    def _extract_hashtags(self, texts: list) -> list:
        """Extract unique hashtags from generated texts."""
        import re
        hashtags = set()
        
        for text in texts:
            if text:
                found = re.findall(r'#\w+', text)
                hashtags.update(found)
        
        return list(hashtags)[:15]  # Limit to 15 hashtags
    
    def _generate_fallback_blog(self, video: VideoInfo, title: str) -> str:
        """Generate a simple fallback blog post if AI fails."""
        return f"""# {title}

**Published:** {video.published_at}  
**Channel:** {video.channel_title}  
**Views:** {video.view_count:,}

## About This Video

{video.description[:500] if video.description else 'An amazing nature video from Nature Frontiers.'}

## Watch Now

<div class="youtube-embed">
    <iframe width="560" height="315" 
            src="https://www.youtube.com/embed/{video.id}" 
            frameborder="0" 
            allowfullscreen>
    </iframe>
</div>

## Tags

{', '.join(video.tags[:10]) if video.tags else 'Nature, Wildlife, Conservation'}

---

*Subscribe to Nature Frontiers for more amazing wildlife content!*

#Nature #Wildlife #NatureFrontiers #Conservation #Documentary
"""
    
    def _generate_fallback_content(self, video: VideoInfo) -> GeneratedContent:
        """Generate basic fallback content if AI generation fails."""
        short_title = video.title[:self.max_title_length]
        
        return GeneratedContent(
            short_title=short_title,
            twitter_caption=f"🎬 {short_title}\n\nWatch now: {video.url}\n\n#Nature #Wildlife #NatureFrontiers",
            instagram_caption=f"✨ {short_title}\n\n{video.description[:100]}...\n\n👆 Watch full video (link in bio)\n\n#NaturePhotography #Wildlife #NatureLovers #Conservation #NatureFrontiers",
            tiktok_caption=f"{short_title} 🌿 #nature #wildlife #fyp #viral",
            linkedin_caption=f"New from Nature Frontiers: {short_title}\n\nWatch here: {video.url}\n\n#NatureDocumentary #Wildlife #Education",
            blog_markdown=self._generate_fallback_blog(video, short_title),
            blog_html_embed=f'<iframe width="560" height="315" src="https://www.youtube.com/embed/{video.id}" frameborder="0" allowfullscreen></iframe>',
            hashtags=['#Nature', '#Wildlife', '#NatureFrontiers']
        )
