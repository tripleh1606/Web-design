# Authentication parallel planning bundle

## Draft documents and final destinations

The complete English execution specification is the four linked documents below, read in this order. They were written during this planning session and must all be read before translation. This index is not a substitute for the four contents.

1. Shared contract: local://auth-contract-english.md -> final canonical proposal local://auth-parallel-plan.md.
2. Registration: local://auth-registration-english.md -> final local://auth-registration-plan.md.
3. Login and sole shared integration owner: local://auth-login-english.md -> final local://auth-login-plan.md.
4. Logout: local://auth-logout-english.md -> final local://auth-logout-plan.md.

## Presentation contract

Each final document must be a faithful Vietnamese translation preserving all substantive details, literals, APIs, constraints, prerequisites, checks, decisions and uncertainties. First three level-two headings in each document, in this order: Bối cảnh hiện tại; Chức năng cần triển khai; Hướng triển khai tổng thể. Translate remaining headings appropriately. Do not add implementation, invent runtime evidence, shorten away load-bearing details or change code/env/paths. Include the corresponding English source path and this bundle index in each final document so future agents can use English model-to-model communication.

The final shared contract must link the three final companion plans and state the actual order: sole login integrator completes shared foundation first; all three finish disjoint work in parallel; then same integrator mounts real modules, independent review and verification. Three feature plans plus one shared contract are the requested output. Repository remains unchanged during plan mode; all deliverables are session-local files.
