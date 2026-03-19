import { useEffect } from "react";
import { useLocation } from "wouter";

export default function MyAgentRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/dashboard"); }, []);
  return null;
}
