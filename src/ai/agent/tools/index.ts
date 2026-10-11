import { Tool } from "../tool.js";
import { GetJobDetailsTool } from "./get-job-details.tool.js";
import { AnalyzeQualificationFitTool } from "./analyze-qualification-fit.tool.js";
import { DraftCoverLetterTool } from "./draft-cover-letter.tool.js";
import { GenerateInterviewPrepTool } from "./generate-interview-prep.tool.js";
import { SearchSavedJobsTool } from "./search-saved-jobs.tool.js";
import { NameConversationTool } from "./name-conversation.tool.js";

export {
  GetJobDetailsTool,
  AnalyzeQualificationFitTool,
  DraftCoverLetterTool,
  GenerateInterviewPrepTool,
  SearchSavedJobsTool,
  NameConversationTool,
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
    new NameConversationTool(),
  ];
}
