import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "bz_session_id";

export const getSessionId = (): string => {
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
};

export const usePageTracking = () => {
  const location = useLocation();

  useEffect(() => {
    // Skip admin/driver internal routes
    if (
      location.pathname.startsWith("/admin") ||
      location.pathname.startsWith("/driver")
    ) {
      return;
    }

    const track = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await supabase.from("page_views").insert({
          session_id: getSessionId(),
          user_id: session?.user?.id || null,
          path: location.pathname,
          referrer: document.referrer || null,
          user_agent: navigator.userAgent.slice(0, 200),
        });
      } catch {
        // silent fail - tracking should never break the app
      }
    };
    track();
  }, [location.pathname]);
};
