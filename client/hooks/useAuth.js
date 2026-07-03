"use client";

import { useCallback, useEffect, useState } from "react";
import { api, getAuthToken, setAuthToken } from "../lib/api";
import { resetSocket } from "../lib/socket";

// Session state for the signed-in user. Each mount validates the stored token
// against /auth/me once; `loading` guards route redirects until that resolves.
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!getAuthToken()) {
      setLoading(false);
      return () => { alive = false; };
    }
    api("/auth/me")
      .then((payload) => { if (alive) setUser(payload.user); })
      .catch(() => setAuthToken("")) // stale/invalid token: clear it
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // login/signup/demo all resolve to the same shape: { token, user }.
  const acceptSession = useCallback((payload) => {
    setAuthToken(payload.token);
    resetSocket(); // next socket connects as this user
    setUser(payload.user);
    return payload.user;
  }, []);

  const signOut = useCallback(() => {
    setAuthToken("");
    resetSocket();
    setUser(null);
  }, []);

  return { user, loading, acceptSession, signOut };
}
