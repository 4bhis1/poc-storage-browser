/**
 * Handles Authentication tokens and session state.
 */
class AuthManager {
    constructor() {
        this.token = null;
    }

    setToken(token) {
        this.token = token;
        console.log('[AuthManager] Token updated');
    }

    getToken() {
        return this.token;
    }

    isAuthenticated() {
        return !!this.token;
    }

    clear() {
        this.token = null;
    }
}

module.exports = new AuthManager();
