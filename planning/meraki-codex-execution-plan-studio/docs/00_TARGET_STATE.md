# Target state and operational definition

“Meraki knows the user deeply” is not a testable engineering statement. The mechanism is complete when the following capabilities are demonstrated.

## Knowledge dimensions

### 1. Facts

The agent recalls declared, relevant facts without fabricating unknowns.

Metric:

- factual precision;
- factual recall;
- stale-fact rate;
- source attribution.

### 2. Current state

The agent knows the active task, project, deadline, constraints, recent decisions, and unresolved blockers.

Metric:

- current-context coverage;
- expired-context leakage;
- project confusion rate.

### 3. Preferences

The agent predicts what the user is likely to prefer in a defined context.

Metric:

- pairwise-choice prediction accuracy;
- calibration;
- context transfer;
- abstention on insufficient evidence.

### 4. Judgment

The agent understands why something is acceptable, weak, wrong, off-brand, generic, or contextually inappropriate.

Metric:

- criterion prediction;
- reason agreement;
- counterexample detection;
- correction recurrence.

### 5. Voice and communication

The agent adjusts tone, rhythm, directness, vocabulary, structure, and format by channel and mode.

Metric:

- blind voice-match preference;
- banned-pattern recurrence;
- factual integrity under style imitation;
- mode-classification accuracy.

### 6. Cognitive working pattern

The agent adapts how it collaborates:

- mechanism-first versus example-first;
- divergent versus convergent phase;
- desired abstraction level;
- decision format;
- need for alternatives;
- tolerance for uncertainty;
- review cadence.

Metric:

- interaction-friction count;
- unnecessary clarification rate;
- successful next-action prediction;
- user override rate.

### 7. Workflow and procedure

The agent follows learned operating patterns for coding, design, writing, research, and planning.

Metric:

- sequence adherence;
- test and definition-of-done compliance;
- repeated process error rate.

### 8. Modes

The system distinguishes modes such as:

- direct product critique;
- creative exploration;
- coding execution;
- public founder voice;
- private reflection;
- formal client communication.

Metric:

- mode resolution accuracy;
- mode leakage;
- conflicting-rule resolution.

### 9. Learning

A correction changes related future behavior without corrupting unrelated tasks.

Metric:

- update latency;
- relevant future-pack change;
- unrelated-pack invariance;
- rollback success;
- correction burden reduction.

### 10. Uncertainty

The system knows what it does not know.

Metric:

- confidence calibration;
- unsupported-claim rate;
- correct abstention;
- active-question information gain.

## Release-level demonstration

The release proof must show:

1. a baseline agent repeats a known error;
2. the user corrects it;
3. Meraki extracts direct evidence;
4. Meraki proposes a narrowly scoped atom;
5. the atom is confirmed or promoted under policy;
6. a related task retrieves the atom;
7. guided output changes in the intended direction;
8. an unrelated task does not receive the atom;
9. feedback updates utility or confidence;
10. a later task requires less correction.

## Explicit non-goals

- clinical psychological modeling;
- diagnosis;
- hidden emotion inference;
- exact simulation of a human mind;
- guaranteed reproduction of the user;
- autonomous model-weight training in the foundation build;
- unsupervised self-rewriting production systems.
