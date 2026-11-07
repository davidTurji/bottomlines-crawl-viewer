"""Print security IDs/locations only, never scanner matches, snippets or secrets."""
import json
import sys
from pathlib import Path


def summarize(report):
    findings = []
    for result in report.get("Results", []):
        for item in result.get("Vulnerabilities", []) or []:
            if item.get("Severity") in {"HIGH", "CRITICAL"}:
                findings.append({"kind": "dependency", "target": result.get("Target"),
                                 "id": item.get("VulnerabilityID"), "severity": item.get("Severity"),
                                 "package": item.get("PkgName"), "installed": item.get("InstalledVersion"),
                                 "fixed": item.get("FixedVersion")})
        for item in result.get("Secrets", []) or []:
            if item.get("Severity") in {"HIGH", "CRITICAL"}:
                findings.append({"kind": "secret", "target": result.get("Target"),
                                 "id": item.get("RuleID"), "severity": item.get("Severity"),
                                 "line": item.get("StartLine")})
    return findings


if __name__ == "__main__":
    report = json.loads(Path(sys.argv[1]).read_text())
    if not isinstance(report, dict) or "Results" not in report:
        raise SystemExit("Scanner did not produce a valid result; refusing a false green")
    findings = summarize(report)
    for finding in findings:
        print(json.dumps(finding, sort_keys=True))
    print(f"High/critical dependency or secret findings: {len(findings)}")
    raise SystemExit(bool(findings))
