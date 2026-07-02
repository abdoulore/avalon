"use client";

import { useCallback, useEffect, useState } from "react";

export function useToast() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) {
      return undefined;
    }
    const timer = window.setTimeout(() => setMessage(""), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  const showToast = useCallback((nextMessage) => setMessage(nextMessage), []);
  return { message, showToast };
}
