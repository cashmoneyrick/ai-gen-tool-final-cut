# PROJECT_STATUS.md

## Current Focus

**Phase 1 — Fix the Foundation**

Full diagnostic completed 2026-04-27. Rebuilding from a solid base before adding anything new.

Phase 1 priorities in order:
1. Fix feedback loop — operator writes verbal notes back to output records
2. Fix winners in V3 — remove the bypass, make winners influence generation
3. Fix prompt injection — recency decay, strip vague filler, priority tiers not pile-up
4. Fix data storage — single source of truth, operator reads all sessions not just sessions[0]
5. Incremental brief updates when new ratings come in

## Do Not Touch

- Anything in Phase 2+ until Phase 1 is fully tested and working
- New product features (pipeline, mass production, on-hand photography)
- UI redesign (comes after the system works correctly)

## Builder Notes

- One fix at a time. Rick tests with a real session after each fix before moving on.
- The feedback loop fix is first — everything else depends on it.
- Collections replace sessions as the primary data unit. Theme → Collection → Outputs/Winners.
- Claude is the evaluator. Gemini generates. Never conflate the two.
- Measure success: does the operator remember things from last session? Does Rick have to re-explain things he already said?

## Operator Notes

- Operator is being rebuilt as a proper tool-using agent, not a one-shot script.
- Nail technique knowledge base comes from Rick — encode what he describes.
- Before generating, check for uncertainty. Ask Rick instead of guessing.
