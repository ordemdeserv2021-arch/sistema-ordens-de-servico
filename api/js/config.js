const AppConfig = {
    DEFAULT_NEON_AUTH_URL: "https://ep-raspy-feather-am4wgamy.neonauth.c-5.us-east-1.aws.neon.tech/neondb/auth",

    getNeonAuthUrl() {
        return localStorage.getItem('neon_auth_url') || this.DEFAULT_NEON_AUTH_URL;
    },
    saveNeonAuthUrl(url) {
        localStorage.setItem('neon_auth_url', url);
    },
    getGeminiKey() {
        return localStorage.getItem('gemini_api_key') || '';
    },
    saveGeminiKey(key) {
        localStorage.setItem('gemini_api_key', key);
    }
};
