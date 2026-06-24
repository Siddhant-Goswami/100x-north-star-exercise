// Thin PostHog wrapper for the North Star exercise.
//
// Goals:
//   * One small, dependency-free surface (window.Analytics) the app calls.
//   * Completely safe to call before — or without — PostHog being configured:
//     every method is a no-op until a project key is present in APP_CONFIG.
//   * No PII leaves the device except an explicit identify() on submission.
(function (window) {
  'use strict';

  const config = (window.APP_CONFIG && window.APP_CONFIG.posthog) || {};
  const host = config.host || 'https://us.i.posthog.com';
  const isLocalhost = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
  const enabled = Boolean(config.key) && !(config.disableOnLocalhost && isLocalhost);

  // Official PostHog snippet — loads array-stub immediately so calls made
  // before the SDK finishes downloading are queued, then replayed.
  function loadPostHog() {
    !function (t, e) {
      var o, n, p, r;
      e.__SV || (window.posthog = e, e._i = [], e.init = function (i, s, a) {
        function g(t, e) { var o = e.split('.'); 2 == o.length && (t = t[o[0]], e = o[1]), t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; }
        (p = t.createElement('script')).type = 'text/javascript', p.crossOrigin = 'anonymous', p.async = !0, p.src = s.api_host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js', (r = t.getElementsByTagName('script')[0]).parentNode.insertBefore(p, r);
        var u = e;
        for (void 0 !== a ? u = e[a] = [] : a = 'posthog', u.people = u.people || [], u.toString = function (t) { var e = 'posthog'; return 'posthog' !== a && (e += '.' + a), t || (e += ' (stub)'), e; }, u.people.toString = function () { return u.toString(1) + '.people (stub)'; }, o = 'init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug'.split(' '), n = 0; n < o.length; n++) g(u, o[n]);
        e._i.push([i, s, a]);
      }, e.__SV = 1);
    }(document, window.posthog || []);

    window.posthog.init(config.key, {
      api_host: host,
      person_profiles: 'identified_only',
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      // Privacy: never record raw text the user types into the exercise.
      mask_all_text: false
    });
  }

  if (enabled) {
    try {
      loadPostHog();
    } catch (error) {
      // Analytics must never break the exercise.
    }
  }

  function call(method, args) {
    if (!enabled || !window.posthog || typeof window.posthog[method] !== 'function') return;
    try {
      window.posthog[method].apply(window.posthog, args);
    } catch (error) {
      // Swallow — analytics is best-effort and never user-facing.
    }
  }

  window.Analytics = {
    enabled,
    // Track an event with optional properties.
    capture(event, properties) {
      call('capture', [event, properties || {}]);
    },
    // Tie subsequent events to a known person (only after consented submit).
    identify(distinctId, properties) {
      call('identify', [distinctId, properties || {}]);
    },
    // Attach properties to the current person/session for every later event.
    register(properties) {
      call('register', [properties || {}]);
    },
    reset() {
      call('reset', []);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
