"""
CLI bridge for python-jobspy scraping.
Accepts JSON input over stdin or command-line arguments,
executes jobspy.scrape_jobs, and outputs a sanitized JSON array to stdout.
"""

import sys
import json
import math
import argparse
from typing import Any, Dict, List
from jobspy import scrape_jobs


def clean_val(val: Any) -> Any:
    """Helper to convert NaN, null, and non-serializable values to None or clean types."""
    if val is None:
        return None
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    return val


def main():
    parser = argparse.ArgumentParser(description="JobSpy Bridge CLI")
    parser.add_argument("--search-term", type=str, default="Software Engineer", help="Job query")
    parser.add_argument("--location", type=str, default="Doylestown, PA", help="Target location")
    parser.add_argument("--distance", type=int, default=35, help="Radius in miles")
    parser.add_argument("--is-remote", action="store_true", default=False, help="Remote filter")
    parser.add_argument("--results-wanted", type=int, default=5, help="Results wanted per site")
    parser.add_argument("--sites", type=str, default="indeed,google", help="Comma-separated sites")
    parser.add_argument("--country-code", type=str, default="USA", help="ISO country code")
    parser.add_argument("--hours-old", type=int, default=72, help="Max posting age in hours")

    args = parser.parse_args()

    # Parse and validate requested sites
    raw_sites = [s.strip().lower() for s in args.sites.split(",") if s.strip()]
    valid_sites = {"linkedin", "indeed", "glassdoor", "zip_recruiter", "google"}
    target_sites = [s for s in raw_sites if s in valid_sites]
    if not target_sites:
        target_sites = ["indeed", "google"]

    result = {
        "success": True,
        "requested_sites": target_sites,
        "total_found": 0,
        "errors": {},
        "jobs": []
    }

    try:
        df = scrape_jobs(
            site_name=target_sites,
            search_term=args.search_term,
            location=args.location,
            distance=args.distance,
            is_remote=args.is_remote,
            results_wanted=args.results_wanted,
            country_indeed=args.country_code,
            hours_old=args.hours_old,
        )

        if df is not None and not df.empty:
            records = df.to_dict(orient="records")
            for r in records:
                min_amt = clean_val(r.get("min_amount"))
                max_amt = clean_val(r.get("max_amount"))
                date_posted_val = clean_val(r.get("date_posted"))
                is_remote_val = clean_val(r.get("is_remote"))

                job_record = {
                    "id": str(clean_val(r.get("id")) or ""),
                    "site": str(clean_val(r.get("site")) or "unknown"),
                    "job_url": clean_val(r.get("job_url")),
                    "job_url_direct": clean_val(r.get("job_url_direct")),
                    "title": str(clean_val(r.get("title")) or "Untitled"),
                    "company": clean_val(r.get("company")),
                    "location": clean_val(r.get("location")),
                    "date_posted": str(date_posted_val) if date_posted_val else None,
                    "job_type": clean_val(r.get("job_type")),
                    "salary_source": clean_val(r.get("salary_source")),
                    "interval": clean_val(r.get("interval")),
                    "min_amount": float(min_amt) if min_amt is not None else None,
                    "max_amount": float(max_amt) if max_amt is not None else None,
                    "currency": clean_val(r.get("currency")),
                    "is_remote": bool(is_remote_val) if is_remote_val is not None else None,
                    "job_level": clean_val(r.get("job_level")),
                    "job_function": clean_val(r.get("job_function")),
                    "listing_type": clean_val(r.get("listing_type")),
                    "description": clean_val(r.get("description")),
                    "company_industry": clean_val(r.get("company_industry")),
                    "company_url": clean_val(r.get("company_url")),
                    "company_logo": clean_val(r.get("company_logo")),
                }
                result["jobs"].append(job_record)
            result["total_found"] = len(result["jobs"])

    except Exception as e:
        result["success"] = False
        result["errors"]["scrape_execution"] = str(e)

    # Print pure JSON output to stdout
    print(json.dumps(result))


if __name__ == "__main__":
    main()
