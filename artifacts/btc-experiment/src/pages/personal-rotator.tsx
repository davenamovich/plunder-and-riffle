import { useEffect } from "react";
import { useRoute } from "wouter";

export default function PersonalRotator() {
  const [, params] = useRoute("/r/:referralCode");
  const referralCode = params?.referralCode;

  useEffect(() => {
    if (referralCode) sessionStorage.setItem("btc_ref", referralCode.toUpperCase());
    window.location.replace("/agents");
  }, [referralCode]);

  return null;
}
