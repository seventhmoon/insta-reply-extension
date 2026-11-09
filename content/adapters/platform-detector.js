/**
 * InstaReply AI - Multi-Platform Detector & Unified Adapter Registry
 * Identifies the active platform and provides a central plugin registry
 * so adapters self-register their DOM hooks, character limits, and prompt rules.
 */

(function () {
  'use strict';

  const adapters = new Map();

  const PLATFORM_METADATA = {
    instagram: {
      id: 'instagram',
      displayName: 'Instagram',
      charLimit: null,
      defaultContextType: 'comment'
    },
    x: {
      id: 'x',
      displayName: 'X (Twitter)',
      charLimit: 280,
      defaultContextType: 'comment'
    },
    linkedin: {
      id: 'linkedin',
      displayName: 'LinkedIn',
      charLimit: null,
      defaultContextType: 'comment'
    },
    threads: {
      id: 'threads',
      displayName: 'Threads',
      charLimit: 500,
      defaultContextType: 'comment'
    },
    facebook: {
      id: 'facebook',
      displayName: 'Facebook',
      charLimit: null,
      defaultContextType: 'comment'
    },
    meta_business: {
      id: 'meta_business',
      displayName: 'Meta Business Suite',
      charLimit: null,
      defaultContextType: 'dm'
    },
    github: {
      id: 'github',
      displayName: 'GitHub',
      charLimit: null,
      defaultContextType: 'comment'
    },
    google_play: {
      id: 'google_play',
      displayName: 'Google Play Reviews',
      charLimit: 350,
      defaultContextType: 'comment'
    },
    youtube: {
      id: 'youtube',
      displayName: 'YouTube & YouTube Studio',
      charLimit: null,
      defaultContextType: 'comment'
    },
    generic: {
      id: 'generic',
      displayName: 'Universal Web Page',
      charLimit: null,
      defaultContextType: 'comment'
    }
  };

  function detectPlatform(urlOrHostname) {
    const target = (urlOrHostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();

    // Check registered domain-specific adapters first (excluding 'generic' catch-all)
    for (const [id, adapter] of adapters.entries()) {
      if (id === 'generic') continue;
      if (adapter && typeof adapter.canHandle === 'function' && adapter.canHandle(target)) {
        return id;
      }
    }

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
    if (target.includes('github.com')) {
      return 'github';
    }
    if (target.includes('play.google.com')) {
      return 'google_play';
    }
    if (target.includes('youtube.com') || target.includes('youtu.be')) {
      return 'youtube';
    }
    return 'generic';
  }

  /**
   * Registers a platform adapter into the unified registry
   */
  function registerAdapter(adapter) {
    if (!adapter || !adapter.platform) return false;
    adapters.set(adapter.platform, adapter);
    return true;
  }

  /**
   * Resolves an adapter by platform ID, falling back to window.<AdapterName> globals
   */
  function getAdapter(platformId) {
    const plat = platformId || detectPlatform();
    if (adapters.has(plat)) {
      return adapters.get(plat);
    }
    if (typeof window !== 'undefined') {
      const globalMap = {
        x: window.XAdapter,
        linkedin: window.LinkedInAdapter,
        threads: window.ThreadsAdapter,
        facebook: window.FacebookAdapter,
        meta_business: window.MetaBusinessAdapter,
        github: window.GitHubAdapter,
        google_play: window.GooglePlayAdapter,
        youtube: window.YouTubeAdapter,
        generic: window.GenericPageAdapter
      };
      if (globalMap[plat]) {
        adapters.set(plat, globalMap[plat]);
        return globalMap[plat];
      }
    }
    return null;
  }

  /**
   * Returns the active platform's adapter for the current page
   */
  function getActiveAdapter(urlOrHostname) {
    const plat = detectPlatform(urlOrHostname);
    return getAdapter(plat);
  }

  /**
   * Returns the character limit for a given platform (or null if unconstrained)
   */
  function getPlatformCharLimit(platformId, contextOverrideLimit = null) {
    if (contextOverrideLimit) return contextOverrideLimit;
    const plat = platformId || detectPlatform();
    const adapter = getAdapter(plat);
    if (adapter && typeof adapter.charLimit === 'number') {
      return adapter.charLimit;
    }
    return PLATFORM_METADATA[plat]?.charLimit || null;
  }

  /**
   * Returns metadata for a platform
   */
  function getPlatformMetadata(platformId) {
    const plat = platformId || detectPlatform();
    return PLATFORM_METADATA[plat] || { id: plat, displayName: plat, charLimit: null, defaultContextType: 'comment' };
  }

  /**
   * Returns all registered adapter IDs
   */
  function listSupportedPlatforms() {
    return Object.keys(PLATFORM_METADATA);
  }

  const SocialPlatformDetector = {
    detectPlatform,
    registerAdapter,
    getAdapter,
    getActiveAdapter,
    getPlatformCharLimit,
    getPlatformMetadata,
    listSupportedPlatforms,
    PLATFORM_METADATA
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SocialPlatformDetector;
  }
  if (typeof window !== 'undefined') {
    window.SocialPlatformDetector = SocialPlatformDetector;
    window.PlatformRegistry = SocialPlatformDetector;
  }
})();
