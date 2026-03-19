import { useEffect } from "react";
import { useRoute } from "wouter";

export default function PersonalRotator() {
  const [, params] = useRoute("/r/:userSlug");
  const userSlug = params?.userSlug;

  useEffect(() => {
    if (userSlug) sessionStorage.setItem("btc_ref", userSlug);
    window.location.replace("/agents");
  }, [userSlug]);

  return null;
}
