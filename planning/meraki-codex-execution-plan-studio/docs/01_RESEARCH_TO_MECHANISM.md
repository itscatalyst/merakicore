# Research translated into Meraki mechanisms

## 1. Brain-signal decoding: shared encoder plus person-specific calibration

Meta-affiliated Brain2Qwerty maps noisy EEG/MEG sequences to typed character sequences. The useful pattern is not “read minds.” It is:

```text
high-dimensional temporal stream
→ normalization
→ shared representation
→ subject-specific calibration
→ sequence decoder
→ error analysis
```

Meraki translation:

```text
heterogeneous behavioral stream
→ canonical events
→ modality-specific feature extraction
→ shared behavioral latent representation
→ user-specific residual
→ context/mode adapter
→ profile atoms and predictions
```

Do not create unrelated profile systems for writing, visual taste, coding, and conversation. Create one evidence model and multiple feature adapters.

### Applied design

`SharedBehaviorFeature` represents universal observable dimensions:

- selects versus rejects;
- edits by deletion/addition/reordering;
- asks for depth versus brevity;
- changes abstraction;
- accepts/rejects phrases;
- chooses one artifact over another;
- changes workflow order;
- corrects facts;
- changes direction.

`UserResidual` represents how one person weights or interprets those features.

`ModeResidual` represents changes under context.

Conceptually:

```text
user_state(task) =
shared_encoder(events)
+ user_residual(user)
+ mode_residual(mode)
+ project_residual(project)
+ current_state
```

This is an engineering abstraction, not a neural model requirement for v0.

## 2. TRIBE v2: unified multimodal space and interpretable latent factors

TRIBE v2 predicts brain responses across video, audio, and language using a unified model and extracts interpretable latent features.

Meraki translation:

- normalize all modalities into one event ontology;
- retain raw modality data;
- extract interpretable features;
- map features into common profile facets;
- preserve modality-specific evidence;
- support cross-modal hypotheses only with evidence.

Example:

```text
visual save:
  low-level: density, contrast, alignment
  domain-level: editorial layout, condensed typography
  self-interpretation: “feels raw, cultural, not corporate”
  action: saved
  context: Catalyst landing page
```

The shared concept “controlled visual tension” may later influence image selection, landing-page critique, and written creative direction. It should not automatically alter coding style.

## 3. Scaling laws: personal longitudinal data matters

Recent neural-decoding work reports strong dependence on the amount of data available per subject. The product implication is that Meraki’s moat is longitudinal, high-quality, person-specific evidence—not a generic personality taxonomy.

Applied design:

- optimize for repeated evidence from one user;
- preserve history;
- calibrate per user;
- avoid pooling private profile atoms across users;
- use population priors only as weak cold-start priors;
- let user evidence dominate.

## 4. Deconstructing Taste: four-stage aesthetic representation

The closest verified project to “taste translated into math/code” is *Deconstructing Taste*. I could not verify that it is an MIT project.

It separates:

1. low-level machine-extracted visual features;
2. domain-specific designer features;
3. the consumer’s own interpretation;
4. pairwise aesthetic judgment.

Meraki should store all four separately.

```text
Object features != domain meaning != personal meaning != final judgment
```

Example:

```json
{
  "object_features": {
    "density": 0.81,
    "contrast": 0.74,
    "symmetry": 0.33
  },
  "domain_features": [
    "editorial-grid",
    "compressed-type",
    "layered-composition"
  ],
  "user_interpretation": [
    "feels culturally alive",
    "less SaaS-like"
  ],
  "judgment": {
    "choice": "B",
    "context": "Catalyst home page",
    "reason": "more tension without losing hierarchy"
  }
}
```

## 5. Bradley–Terry preference modeling

Pairwise choices can be converted into latent preference scores.

For two artifacts `A` and `B`:

```text
P(A preferred over B | user, context)
= sigmoid(U(user, context, A) - U(user, context, B))
```

A practical utility model:

```text
U(u, c, x) =
w_global · features(x)
+ w_user[u] · features(x)
+ w_mode[u,c] · features(x)
+ interaction_terms
```

V0:

- record pairwise choices and reasons;
- maintain win/loss counts;
- fit Bradley–Terry scores offline;
- expose uncertainty;
- do not let the score replace interpretable reasons.

Later:

- hierarchical Bayesian Bradley–Terry;
- personalized ranker;
- contextual reward model;
- active pair selection.

## 6. TASTE: preference is multi-dimensional

The TASTE dataset separates graphic-design judgment into multiple criteria such as typography, hierarchy, color, layout, and brief fidelity. It also reports that general-purpose judges do not reliably reproduce professional designer majority judgment.

Meraki translation:

Never store:

```text
liked = true
```

as the complete signal.

Store:

```text
overall_choice
criterion_scores
criterion_reasons
context
confidence
tradeoffs
```

Suggested creative criteria:

- brief fidelity;
- typography;
- composition;
- hierarchy;
- color;
- texture/material;
- motion;
- emotional effect;
- originality;
- cultural relevance;
- polish/rawness;
- usability;
- brand fit.

The same pattern applies outside design:

Writing:

- voice;
- argument;
- specificity;
- structure;
- rhythm;
- credibility;
- novelty;
- audience fit.

Coding:

- correctness;
- architecture;
- simplicity;
- testability;
- performance;
- maintainability;
- repository fit.

## 7. Personalized preference and reward models

Personalized aesthetic research such as PAMELA models individual taste rather than population-average beauty. Meraki’s long-term path is:

```text
profile atoms and retrieval
→ lightweight personal judge
→ candidate reranking
→ generation steering
→ optional personal reward model
```

Do not train this in the foundation build. First create clean, contextual, versioned preference data.

## 8. Reinforcement learning from feedback

Recent scientific-taste work frames judgment learning as preference modeling plus policy alignment using paired outcomes.

Meraki translation:

- first build a personal judge from choices and corrections;
- use it to rank or critique candidate outputs;
- keep user feedback as highest authority;
- use model judges only as weak evaluators;
- later optimize generation policies against confirmed personal reward.

## 9. Active learning

The engine should not ask constant onboarding questions. It should ask when the expected information gain is high.

Question priority:

```text
priority =
uncertainty
× expected future retrieval frequency
× decision impact
× contradiction severity
÷ interruption cost
```

Examples:

- “Is this rejection global, or only for investor-facing copy?”
- “You selected B for hierarchy but A for color. Which criterion matters more here?”
- “This conflicts with an older rule. Did your preference change, or is this a different mode?”
