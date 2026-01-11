/**
 * Scrapes media URLs from a CompanyCam public timeline page
 * @param {string} publicUrl - The public timeline URL (e.g., https://app.companycam.com/timeline/...)
 * @returns {Promise<Array>} Array of media objects with URLs
 */
export async function scrapeTimelineMedia(publicUrl) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(publicUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const html = await response.text();
    const media = [];

    // Extract photo-grid items - these are the actual project media
    // Look for <a class="photo-item"> and <a class="photo-item video-item">
    const photoItemRegex = /<a[^>]*class="photo-item[^"]*"[^>]*>/g;
    const photoItems = [...html.matchAll(photoItemRegex)];

    console.log(`Found ${photoItems.length} photo-item elements in photo-grid`);

    photoItems.forEach((match, index) => {
      const itemHtml = match[0];

      // Check if it's a video (has data-mp4-url)
      const mp4UrlMatch = itemHtml.match(/data-mp4-url="([^"]+)"/);

      if (mp4UrlMatch) {
        // It's a video
        const videoUrl = mp4UrlMatch[1];
        const thumbnailMatch = itemHtml.match(/data-background-image-url="([^"]+)"/);
        const thumbnail = thumbnailMatch ? thumbnailMatch[1] : null;

        media.push({
          id: `video-${index}`,
          media_type: 'video',
          uris: [
            {
              uri: videoUrl,
              type: 'video/mp4'
            }
          ],
          thumbnail: thumbnail,
          captured_at: new Date().toISOString(),
          source: 'scraped'
        });
      } else {
        // It's a photo
        const hrefMatch = itemHtml.match(/href="([^"]+)"/);
        const thumbnailMatch = itemHtml.match(/data-thumb="([^"]+)"/);

        if (hrefMatch) {
          const photoUrl = hrefMatch[1];
          const thumbnail = thumbnailMatch ? thumbnailMatch[1] : photoUrl;

          media.push({
            id: `photo-${index}`,
            media_type: 'photo',
            uris: [
              {
                uri: photoUrl,
                size: 2048,
                type: 'image'
              },
              {
                uri: thumbnail,
                size: 400,
                type: 'image'
              }
            ],
            captured_at: new Date().toISOString(),
            source: 'scraped'
          });
        }
      }
    });

    if (media.length === 0) {
      console.log('No media items found in photo-grid');
      return [];
    }

    const videoCount = media.filter(m => m.media_type === 'video').length;
    const photoCount = media.filter(m => m.media_type === 'photo').length;

    console.log(`Scraped ${media.length} media items from timeline (${videoCount} videos, ${photoCount} photos)`);
    return media;

  } catch (error) {
    console.error('Error scraping timeline:', error.message);
    return [];
  }
}
