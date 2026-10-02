# Shopee AFF AI Ads Manager

Starter V1 for Railway.

## Current
- Dashboard
- Max CPC concept
- Safe default: no automatic ad changes
- /health endpoint

## Next
- Meta Marketing API connection
- Shopee CSV importer
- OpenAI analysis
- Rule engine and audit logs


## Deployment
Force production deployment after multi-page dashboard/settings/create split. Build marker: 2026-10-01-multipage-v2.


Post selection: choose a Facebook Page and load posts. The server retrieves the selected Page token without exposing it to the browser. Select a post to fill its Post ID; reconnect Meta in Settings if the token is invalid.
