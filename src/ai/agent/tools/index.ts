import { Tool } from "../tool";
import { GetJobDetailsTool } from "./get-job-details.tool";
import { AnalyzeQualificationFitTool } from "./analyze-qualification-fit.tool";
import { DraftCoverLetterTool } from "./draft-cover-letter.tool";
import { GenerateInterviewPrepTool } from "./generate-interview-prep.tool";
import { SearchSavedJobsTool } from "./search-saved-jobs.tool";

export {
  GetJobDetailsTool,
  AnalyzeQualificationFitTool,
  DraftCoverLetterTool,
  GenerateInterviewPrepTool,
  SearchSavedJobsTool,
};

/**
 * Creates the default suite of MVP agent tools.
 */
export function createDefaultTools(): Tool[] {
  return [
    new GetJobDetailsTool(),
    new AnalyzeQualificationFitTool(),
    new DraftCoverLetterTool(),
    new GenerateInterviewPrepTool(),
    new SearchSavedJobsTool(),
  ];
}
