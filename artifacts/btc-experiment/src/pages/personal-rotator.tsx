import { useEffect } from "react";
import { useRoute } from "wouter";

export default function PersonalRotator() {
  const [, params] = useRoute("/r/:code");
  const code = params?.code;

  useEffect(() => {
    if (code) sessionStorage.setItem("btc_ref", code);
    window.location.replace("/agents");
  }, [code]);

  return null;
}
