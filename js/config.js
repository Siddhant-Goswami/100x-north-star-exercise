(function (root) {
  root.APP_CONFIG = {
    exerciseId: 'north-star-cohort-8',
    exerciseTitle: 'Before You Decide',
    cohortName: '6-Month Applied AI Cohort',
    // Deployed Supabase Edge Function for this project.
    submissionEndpoint: 'https://hkgukldmktlobumabewr.supabase.co/functions/v1/submit-exercise',
    // When true, submissions on localhost are simulated so the exercise works
    // end-to-end without a backend during development.
    allowLocalDemo: true,
    // PostHog product analytics. Paste your project API key to switch it on;
    // an empty key makes every analytics call a safe no-op (nothing loads).
    posthog: {
      key: '',
      host: 'https://us.i.posthog.com',
      // Skip analytics on localhost/127.0.0.1 so dev runs don't pollute data.
      disableOnLocalhost: true
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
