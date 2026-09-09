---
title: Android and desktop Chromium support
status: approved
option: C
date: 2026-09-09
---

# Android / desktop support (approved option C)

**Status:** approved option C.

## Goal

Android Chrome and desktop Chromium (Chrome / Edge) are documented and verified clients of the **same** PWA. There are no native apps. iPhone Home Screen remains the primary path for iOS.

## Option C (this plan)

Same installable PWA + Web Push. Light UI platform hints. Harden the service worker for Chromium classic `push` + `notificationclick` if the existing iOS-first path is insufficient. Document setup, multi-device fan-out, and a manual smoke checklist.

## In scope

1. README + AGENT.md Android / desktop setup, multi-device tip, troubleshooting.
2. Coarse platform install/enable hints on home and/or devices (iOS vs Android vs desktop) without breaking multi-account auth.
3. Smoke-test the Chromium Web Push path (unit coverage for extractable SW helpers + documented manual checklist).
4. Harden `public/sw.js` for Chromium `push` + action-button navigation if gaps exist. Do not regress iOS Declarative Web Push.
5. MCP / skill one-liner: a token fans out to every subscribed device on that account.

## Non-goals

- Native Android or desktop apps
- Firefox-first support
- Desktop Safari parity
- Changing the iOS Declarative Web Push payload (`web_push: 8030`)
- Reworking multi-account / topics

## Clients

| Client | Install | Push |
| --- | --- | --- |
| iPhone Safari | Add to Home Screen **required** | Declarative Web Push; SW when mutable / resident |
| Android Chrome | Install app **recommended** | Classic Web Push in tab or installed PWA |
| Desktop Chrome / Edge | Install app **optional** | Classic Web Push in tab or installed PWA |
| Desktop Safari / Firefox | Not verified | Out of scope |

## Service worker contract

- Parse both the Declarative Web Push envelope (`notification` + `navigate` + action `navigate`) and a flat classic payload.
- Never throw on bad or empty `push` data; always show a user-visible notification (Chromium requirement).
- Map action buttons into `notification.data.actions` and resolve them on `notificationclick`.
- Focus an existing same-origin window; `navigate` when needed; fall back to `clients.openWindow` when Chromium rejects `WindowClient.navigate` (common on Android).
- Keep `mutable: true` / `silent: false` server payloads unchanged so iOS Home Screen delivery stays intact.
