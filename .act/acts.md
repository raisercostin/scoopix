# Acts

- [ ] `act01` Command Autocomplete #status/open
- [x] `act02` Version Sources #status/closed
- [ ] `act03` Scoopix Completion Targets #status/open
- [x] `act04` Deno Git Bash PATH #status/closed
- [x] `act05` Cross-Agent MCP Building Blocks #status/closed
- [x] `act06` ArangoDB Windows Installer #status/closed
- [x] `act07` Rustc Source Installer #status/closed
- [x] `act08` Command Taxonomy #status/closed
- [x] `act09` Uninstall Lifecycle #status/closed
- [x] `act10` add top-level fetch command for metadata refresh #status/closed
- [x] `act11` keep update as compatibility alias for fetch #status/closed
- [x] `act12` move manifest version mutation to bucket apply or bucket set-version #status/closed
- [x] `act13` add reinstall command for same source version rebuild #status/closed
- [x] `act14` add pin and unpin where pin also holds automatic upgrades #status/closed
- [x] `act15` add switch command for selecting installed app versions #status/closed
- [x] `act16` add downgrade command for explicit older version installs #status/closed
- [x] `act17` add bucket maintainer discover apply import ignore test commit push reset lint workflow #status/closed
- [x] `act18` add artifact hash to install provenance #status/closed
- [x] `act19` add live install mode for source paths #status/closed
- [x] `act20` fix uninstall for local direct source app identities listed as installed #status/closed
- [x] `act21` define Scoopix command taxonomy for using apps using buckets and maintaining buckets #status/closed
- [x] `act22` Change list/search semantics: make 'scoopix list' show installed apps by default; keep 'scoopix installed' as alias; add 'scoopix list --all' to list all configured bucket apps; preserve 'scoopix list --installed' as compatibility; add 'scoopix search [query]' and 'scoopix available [query]' for bucket/catalog apps, where query is optional and omitted query lists all available apps; consider 'scoopix bucket apps [bucket]' later for per-bucket catalog listing; update README/help/tests #status/closed
- [x] `act23` Fix uninstall semantics to match Scoop-style installed-version lifecycle: current Scoopix behavior is a UX bug because 'scoopix list --installed' shows only the current version but 'scoopix uninstall <app>' refuses when old version directories exist. User reproduced with 'scoopix list --installed' showing local/act-dev current 0.1.0-20260906.4.main.g194fd20.h330d138e199e, then 'scoopix uninstall act-dev' failed because an older 0.1.0-20260906.4.main.g194fd20.he318a31b4004 directory also existed. Compared against Scoop with 'scoop uninstall wiztree', which removed current shims/current link and older version 4.27 without requiring a version. Desired Scoopix behavior: 'scoopix uninstall <app>' removes all installed version dirs, current link, shims, and Scoopix installer metadata for the app; 'scoopix uninstall <app>@<version>' removes only that version and should refuse if that version is current unless a force/all option or switch happens first; add future 'scoopix cleanup <app>' to remove old versions while keeping current; future 'scoopix purge <app>' should remove persisted app data once persist exists. Rationale: installed versions under apps/<app>/<version> are disposable package artifacts, while future persist/<app> should be durable user/app data kept across uninstall/reinstall unless purged. Tests needed: install same direct local source twice with different hashes, list installed shows current, uninstall unqualified removes both versions and shims, uninstall qualified removes only non-current old version, uninstall qualified current refuses with clear message, future cleanup keeps current and removes old versions. #status/closed
- [x] `act24` Clarify and fix qualified uninstall ownership semantics: user reproduced 'scoopix list' showing local/rteel installed, then 'scoopix uninstall rteel' failed because multiple rteel version directories exist, and 'scoopix uninstall dev/rteel' produced the same multiple-version error even though the installed owner is local/rteel and dev/rteel is not the owner. This creates ambiguity about whether '--all' would remove all packages named rteel across owners or only the requested bucket/app identity. Desired semantics: unqualified 'scoopix uninstall rteel' resolves by installed owner and should apply only to that app identity; qualified 'scoopix uninstall local/rteel' applies only to owner local/rteel; qualified 'scoopix uninstall dev/rteel' should refuse with a clear owner mismatch if rteel is installed as local/rteel, unless an explicit replace/adopt behavior is introduced later. '--all' should mean all installed versions for the resolved package identity, not all packages with the same app name across buckets. Related to act23 but distinct: act23 covers removing all version dirs by default; this bug covers bucket-qualified ownership resolution and '--all' scope clarity. Tests needed: install local/rteel with multiple versions and have a dev/rtee or dev/rteel catalog candidate; verify unqualified uninstall resolves local owner, local-qualified uninstall resolves same owner, wrong bucket-qualified uninstall refuses with owner mismatch, and '--all' deletes only the resolved owner's version dirs/shims/state. #status/closed

## Authors
- actor01 Local/User #actor/actor01

## Events

### act10
- 2026-09-07T12:47:40+03 #actor/actor01 created title="add top-level fetch command for metadata refresh"
- 2026-09-07T14:56:00+03 #actor/actor01 closed reason="implemented top-level fetch command and verified help plus isolated fetch"

### act11
- 2026-09-07T12:47:40+03 #actor/actor01 created title="keep update as compatibility alias for fetch"
- 2026-09-07T18:49:58+03 #actor/actor01 closed reason="implemented update as fetch compatibility alias"

### act12
- 2026-09-07T12:47:40+03 #actor/actor01 created title="move manifest version mutation to bucket apply or bucket set-version"
- 2026-09-07T14:56:00+03 #actor/actor01 closed reason="implemented bucket apply as preferred manifest version mutation command while keeping update compatibility warning"

### act13
- 2026-09-07T12:47:40+03 #actor/actor01 created title="add reinstall command for same source version rebuild"
- 2026-09-07T18:49:58+03 #actor/actor01 closed reason="implemented reinstall command for current app version or source identity"

### act14
- 2026-09-07T12:47:40+03 #actor/actor01 created title="add pin and unpin where pin also holds automatic upgrades"
- 2026-09-07T18:49:58+03 #actor/actor01 closed reason="implemented pin and unpin with pins skipped by bulk upgrade"

### act15
- 2026-09-07T12:47:40+03 #actor/actor01 created title="add switch command for selecting installed app versions"
- 2026-09-07T18:49:58+03 #actor/actor01 closed reason="implemented switch command for already installed versions"

### act16
- 2026-09-07T12:47:40+03 #actor/actor01 created title="add downgrade command for explicit older version installs"
- 2026-09-07T18:49:58+03 #actor/actor01 closed reason="implemented downgrade command for explicit older versions"

### act17
- 2026-09-07T12:47:40+03 #actor/actor01 created title="add bucket maintainer discover apply import ignore test commit push reset lint workflow"
- 2026-09-07T18:49:58+03 #actor/actor01 closed reason="implemented initial bucket maintainer discover apply import ignore test commit push reset lint workflow"

### act18
- 2026-09-07T12:47:40+03 #actor/actor01 created title="add artifact hash to install provenance"
- 2026-09-07T18:49:58+03 #actor/actor01 closed reason="implemented artifact sha256 provenance"

### act19
- 2026-09-07T12:47:40+03 #actor/actor01 created title="add live install mode for source paths"
- 2026-09-07T18:49:58+03 #actor/actor01 closed reason="implemented live direct source provenance mode with explicit upgrade refresh"

### act20
- 2026-09-07T12:47:40+03 #actor/actor01 created title="fix uninstall for local direct source app identities listed as installed"
- 2026-09-07T12:52:54+03 #actor/actor01 closed reason="not a Scoopix uninstall bug"

### act21
- 2026-09-07T12:48:24+03 #actor/actor01 created title="define Scoopix command taxonomy for using apps using buckets and maintaining buckets"
- 2026-09-07T14:56:00+03 #actor/actor01 closed reason="documented and implemented initial command taxonomy split for apps buckets and bucket maintenance"

### act22
- 2026-09-07T17:07:12+03 #actor/actor01 created title="Change list/search semantics: make 'scoopix list' show installed apps by default; keep 'scoopix installed' as alias; add 'scoopix list --all' to list all configured bucket apps; preserve 'scoopix list --installed' as compatibility; add 'scoopix search [query]' and 'scoopix available [query]' for bucket/catalog apps, where query is optional and omitted query lists all available apps; consider 'scoopix bucket apps [bucket]' later for per-bucket catalog listing; update README/help/tests"
- 2026-09-07T17:34:12+03 #actor/actor01 closed reason="implemented list default installed list all catalog search available optional query docs and autotest"

### act23
- 2026-09-07T17:14:38+03 #actor/actor01 created title="Fix uninstall semantics to match Scoop-style installed-version lifecycle: current Scoopix behavior is a UX bug because 'scoopix list --installed' shows only the current version but 'scoopix uninstall <app>' refuses when old version directories exist. User reproduced with 'scoopix list --installed' showing local/act-dev current 0.1.0-20260906.4.main.g194fd20.h330d138e199e, then 'scoopix uninstall act-dev' failed because an older 0.1.0-20260906.4.main.g194fd20.he318a31b4004 directory also existed. Compared against Scoop with 'scoop uninstall wiztree', which removed current shims/current link and older version 4.27 without requiring a version. Desired Scoopix behavior: 'scoopix uninstall <app>' removes all installed version dirs, current link, shims, and Scoopix installer metadata for the app; 'scoopix uninstall <app>@<version>' removes only that version and should refuse if that version is current unless a force/all option or switch happens first; add future 'scoopix cleanup <app>' to remove old versions while keeping current; future 'scoopix purge <app>' should remove persisted app data once persist exists. Rationale: installed versions under apps/<app>/<version> are disposable package artifacts, while future persist/<app> should be durable user/app data kept across uninstall/reinstall unless purged. Tests needed: install same direct local source twice with different hashes, list installed shows current, uninstall unqualified removes both versions and shims, uninstall qualified removes only non-current old version, uninstall qualified current refuses with clear message, future cleanup keeps current and removes old versions."
- 2026-09-07T18:49:58+03 #actor/actor01 closed reason="implemented Scoop style uninstall lifecycle and cleanup command"

### act24
- 2026-09-07T17:37:41+03 #actor/actor01 created title="Clarify and fix qualified uninstall ownership semantics: user reproduced 'scoopix list' showing local/rteel installed, then 'scoopix uninstall rteel' failed because multiple rteel version directories exist, and 'scoopix uninstall dev/rteel' produced the same multiple-version error even though the installed owner is local/rteel and dev/rteel is not the owner. This creates ambiguity about whether '--all' would remove all packages named rteel across owners or only the requested bucket/app identity. Desired semantics: unqualified 'scoopix uninstall rteel' resolves by installed owner and should apply only to that app identity; qualified 'scoopix uninstall local/rteel' applies only to owner local/rteel; qualified 'scoopix uninstall dev/rteel' should refuse with a clear owner mismatch if rteel is installed as local/rteel, unless an explicit replace/adopt behavior is introduced later. '--all' should mean all installed versions for the resolved package identity, not all packages with the same app name across buckets. Related to act23 but distinct: act23 covers removing all version dirs by default; this bug covers bucket-qualified ownership resolution and '--all' scope clarity. Tests needed: install local/rteel with multiple versions and have a dev/rtee or dev/rteel catalog candidate; verify unqualified uninstall resolves local owner, local-qualified uninstall resolves same owner, wrong bucket-qualified uninstall refuses with owner mismatch, and '--all' deletes only the resolved owner's version dirs/shims/state."
- 2026-09-07T18:49:58+03 #actor/actor01 closed reason="implemented qualified uninstall owner matching and all scope semantics"

### act01
- 2026-09-07T18:44:14+03 #actor/migration migrated source=".changes/2026-08-15-command-autocomplete.md"

### act02
- 2026-09-07T18:44:14+03 #actor/migration migrated source=".changes/2026-08-15-version-sources.md"
- 2026-09-07T18:44:14+03 #actor/actor01 closed reason="implemented update as fetch compatibility alias"
