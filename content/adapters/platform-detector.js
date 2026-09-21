/**
 * InstaReply AI - Multi-Platform Detector
 * Identifies the active social media platform based on hostname or URL.
 */

(function () {
  'use strict';

  function detectPlatform(urlOrHostname) {
    const target = (urlOrHostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();

    if (target.includes('instagram.com')) {
      return 'instagram';
    }
    if (target.includes('twitter.com') || target.includes('x.com')) {
      return 'x';
    }
    if (target.includes('linkedin.com')) {
      return 'linkedin';
    }
    if (target.includes('business.facebook.com') || target.includes('business.meta.com')) {
      return 'meta_business';
    }
    if (target.includes('facebook.com') || target.includes('fb.com')) {
      return 'facebook';
    }
    if (target.includes('threads.net') || target.includes('threads.com')) {
      return 'threads';
    }
    return 'generic';
  }

  const SocialPlatformDetector = {
    detectPlatform
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SocialPlatformDetector;
  }
  if (typeof window !== 'undefined') {
    window.SocialPlatformDetector = SocialPlatformDetector;
  }
})();
