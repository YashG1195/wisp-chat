import { useState, useEffect } from "react";
import "../styles/LinkPreview.css";

// Simple in-memory cache to avoid fetching the same URL multiple times
const previewCache = new Map();

export default function LinkPreview({ url }) {
  const [data, setData] = useState(previewCache.get(url) || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Avoid refetching if already cached or failed
    if (previewCache.has(url) || failed) return;

    let isMounted = true;
    
    async function fetchMetadata() {
      try {
        const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error("API Request Failed");
        
        const json = await res.json();
        if (json.status === "success" && json.data) {
          if (isMounted) {
            previewCache.set(url, json.data);
            setData(json.data);
          }
        } else {
          throw new Error("No useful data returned");
        }
      } catch (err) {
        if (isMounted) {
          setFailed(true);
        }
      }
    }
    
    fetchMetadata();
    
    return () => {
      isMounted = false;
    };
  }, [url, failed]);

  // Fail silently if no useful data is present
  if (failed || !data) return null;
  if (!data.title && !data.description) return null;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="link-preview-card">
      <div className="lp-header">
        {data.logo?.url && <img className="lp-favicon" src={data.logo.url} alt="favicon" />}
        <span className="lp-title" title={data.title}>
          {data.title || new URL(url).hostname}
        </span>
      </div>
      {data.description && (
        <p className="lp-description">{data.description}</p>
      )}
    </a>
  );
}
