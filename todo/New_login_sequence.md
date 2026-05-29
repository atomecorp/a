# eVe / Atome — Login & Authentication Initialization Sequence

## General Concept

The login interface is designed as a fully immersive, minimalist, full-screen authentication experience.

The interface behaves more like an operating system initialization layer than a traditional web form.

The entire screen acts as the active input surface.

No visible HTML form elements are used.
All interface elements are dynamically generated in JavaScript.

The real input field exists only as a hidden focused input used to:

* trigger the mobile keyboard;
* capture native typing behavior;
* maintain compatibility with iOS and Android;
* preserve accessibility support.

The user never directly sees the native input box.

---

# Visual Philosophy

The interface must feel:

* cinematic;
* futuristic;
* ultra-clean;
* minimal;
* calm;
* immersive;
* OS-level;
* tactile;
* reactive.

The goal is to create a sensation closer to:

* an AI operating system;
* a biometric access system;
* a futuristic terminal;
* a consciousness-oriented interface;

rather than a conventional login form.

---

# Screen Structure

The screen is divided into three major zones:

1. Top instruction zone;
2. Central typing zone;
3. Bottom validation zone.

---

# Top Zone — Instruction Layer

Located near the top of the screen.

Contains:

* current contextual instruction;
* dynamic internationalized text.

Examples:

* “Enter your phone number”;
* “Enter your password”.

Characteristics:

* centered horizontally;
* large typography;
* highly readable;
* floating appearance;
* subtle cinematic glow;
* adaptive scaling for mobile devices.

The instruction changes dynamically according to the current authentication step.

---

# Central Zone — Typing Layer

The center of the screen contains:

* the visible typed text;
* the animated cursor.

The cursor remains visually centered at all times.

This behavior remains active even when:

* the iOS keyboard opens;
* the Android keyboard opens;
* viewport size changes;
* orientation changes occur.

The visual cursor is NOT the native browser cursor.

Instead:

* the native input remains hidden;
* a custom animated cursor is rendered independently.

The entire screen behaves as the active typing surface.

There is no visible textbox.

This creates the feeling that the user is directly interacting with the operating system itself.

---

# Hidden Input Strategy

A hidden native input is permanently focused.

Purpose:

* trigger mobile keyboard;
* keep native IME compatibility;
* preserve auto-correct support if desired;
* preserve accessibility compatibility;
* support iOS restrictions.

Characteristics:

* invisible;
* 1px size;
* transparent;
* no visible caret;
* positioned at viewport center.

All visual rendering is decoupled from the real input.

---

# iOS / Android Keyboard Handling

The system uses:

* visualViewport;
* viewport offset tracking;
* dynamic layout recalculation.

Purpose:

* keep the cursor centered;
* keep the validation button visible;
* avoid keyboard overlap;
* preserve immersion.

When the virtual keyboard appears:

* the center layer moves upward dynamically;
* the validation button rises above the keyboard;
* the interface remains visually stable.

The user never loses visual access to:

* the cursor;
* the typed text;
* the validation button.

---

# Bottom Zone — Validation Button

The validation button is positioned at the bottom center of the screen.

This button also acts as the visual logo.

The button:

* floats above the interface;
* automatically rises above the virtual keyboard;
* remains always visible;
* acts as both branding and validation control.

Initial state:

* futuristic logo;
* inactive validation state.

As soon as the user types at least one character:

* the logo transforms into a validation icon;
* the appearance changes visually;
* the system indicates the step can be confirmed.

After validation:

* the button returns to logo mode;
* the next step begins.

---

# Authentication Sequence

## Step 1 — Phone Number

Initial instruction:

“Enter your phone number”

Behavior:

* keyboard opens after first user interaction;
* typing appears directly in the center of the screen;
* no visible textbox;
* validation button activates after first character.

Validation:

* pressing the bottom validation button;
* or pressing Enter.

Then:

* interface transitions to password mode.

---

## Step 2 — Password

Instruction changes dynamically:

“Enter your password”

Behavior:

* password input uses masked characters;
* centered cinematic typing remains identical;
* validation button behaves the same.

Additional control:

* eye icon appears.

Eye icon behavior:

* show password;
* hide password;
* toggle visibility in real time.

---

# Voice Guidance System

The interface includes an accessibility-oriented voice guidance system.

Purpose:

* accessibility;
* immersive UX;
* support for visually impaired users;
* voice-driven interactions.

---

# Voice Behavior

Voice prompts are intentionally controlled to avoid annoyance.

Behavior:

* instruction spoken once when entering a step;
* not repeated continuously;
* repeated only after long inactivity.

Current inactivity delay:

10 seconds.

Examples:

* “Enter your phone number”;
* “Enter your password”.

The system never speaks:

* typed passwords;
* typed private content.

---

# Voice Toggle / Microphone Button

A microphone button exists in the lower interface area.

Purpose:

* enable/disable voice guidance;
* later trigger speech capture / STT.

States:

## Enabled

* microphone icon visible;
* voice guidance active;
* inactivity reminders active.

## Disabled

* microphone icon becomes crossed/slashed;
* all TTS immediately stops;
* no inactivity reminders;
* no voice prompts.

The visual state clearly indicates whether voice mode is active.

---

# Future Speech Recognition Integration

The microphone system is designed to later support:

* speech-to-text;
* voice login assistance;
* blind-user interaction;
* conversational authentication;
* AI-guided onboarding.

Planned integration:

* MediaDevices;
* local STT;
* remote STT;
* Whisper-like engines;
* streaming transcription.

---

# Accessibility Goals

The interface is designed to support:

* visually impaired users;
* low-vision users;
* keyboard-only usage;
* touch usage;
* voice usage;
* hybrid interactions.

The system intentionally avoids:

* small form fields;
* tiny touch targets;
* cluttered layouts;
* excessive UI density.

---

# UX Goals

The sequence aims to create:

* emotional impact;
* futuristic immersion;
* simplicity;
* immediate understanding;
* low cognitive load;
* premium OS feeling;
* accessibility-first interaction;
* cinematic interaction design.

The experience should feel closer to:

* interacting with an AI entity;
* activating an operating system;
* entering a futuristic environment;

than filling a traditional form.

---

# Technical Notes

## Current Architecture

* JS-generated UI;
* no static form markup;
* hidden native input;
* custom cursor rendering;
* visualViewport keyboard tracking;
* dynamic layout recalculation;
* speech synthesis support;
* mobile-first architecture.

---

# Planned Future Extensions

Potential future additions:

* OTP code step;
* biometric authentication;
* animated AI assistant;
* live waveform visualization;
* conversational voice onboarding;
* AI-generated contextual assistance;
* adaptive accessibility modes;
* emotional voice synthesis;
* avatar presence;
* Matrix / Keycloak integration;
* secure device binding;
* offline authentication mode;
* distributed identity management.
