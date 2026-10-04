// POST /api/hooks/livekit — LiveKit server webhook (configured URL in the LiveKit
// project). Signed with the project API key/secret and verified by WebhookReceiver;
// same handler as /api/video/livekit-webhook. Records join/leave audit events.
export { POST } from '../../video/livekit-webhook/route'
