import fs from "fs";
import path from "path";
import { Conversation } from "../conversation";
import { FileJobRepository } from "../../../db/file-repository";
import { loadSearchProfile } from "../../../config/search-profile";
import { ToolContext } from "../tool";
import {
  GetJobDetailsTool,
  AnalyzeQualificationFitTool,
  DraftCoverLetterTool,
  GenerateInterviewPrepTool,
  SearchSavedJobsTool,
  NameConversationTool,
} from "../tools";
import { GeminiAgent } from "../gemini-agent";
import { UnifiedJobPosting } from "../../../types/job-posting";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runAgentSuite() {
  console.log("\n==========================================================");
  console.log("       Running AI Agent & Tools Verification Suite        ");
  console.log("==========================================================");

  // Setup isolated test store
  const testStorePath = path.join(process.cwd(), "data", "test_agent_store.json");
  if (fs.existsSync(testStorePath)) fs.unlinkSync(testStorePath);

  const repository = new FileJobRepository(testStorePath);
  const profile = loadSearchProfile();

  // Seed sample job into repository
  const sampleJob: UnifiedJobPosting = {
    id: "job-test-777",
    source: "lever",
    source_job_id: "lever-777",
    source_url: "https://jobs.lever.co/test/777",
    canonical_url: "https://jobs.lever.co/test/777",
    application_url: "https://jobs.lever.co/test/777/apply",
    content_hash: "hash-777",
    title: "Senior Full Stack Platform Engineer",
    company: "Acme Corp",
    location: "Doylestown, PA",
    workplace_type: "hybrid",
    employment_type: "full_time",
    seniority: "senior",
    salary_min_annual: 135000,
    salary_max_annual: 165000,
    currency: "USD",
    interval: "yearly",
    raw_salary_text: "$135,000 - $165,000",
    description_text: "Seeking a Senior Full Stack Engineer with TypeScript, React, Node.js, and PostgreSQL expertise to scale cloud services.",
    date_posted: new Date().toISOString(),
    date_discovered: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
    job_status: "saved",
    availability: "open",
    availability_evidence: "Active posting",
    jev_fit: true,
    jev_confidence: 0.88,
    crawler_data: {
      version: "1.0.0",
      extracted_at: new Date().toISOString(),
      source: "lever",
      source_job_id: "lever-777",
      raw_title: "Senior Full Stack Platform Engineer",
      raw_company: "Acme Corp",
      raw_location: "Doylestown, PA",
      raw_description: "Seeking a Senior Full Stack Engineer with TypeScript, React, Node.js, and PostgreSQL expertise.",
      raw_salary_text: "$135,000 - $165,000",
      detected_technologies: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker"],
      detected_benefits: [],
      matched_rules: [],
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await repository.savePosting(sampleJob);
  console.log("✓ Test job seeded into repository");

  // 1. Test Conversation Model & Dynamic Job Tagging
  console.log("\n[Test 1] Conversation state, message ordering, and job tagging...");
  const conv = new Conversation();
  assert(conv.title === "New Conversation", "Initial title should be 'New Conversation'");
  assert(conv.job_ids.length === 0, "Initial job_ids should be empty");

  conv.addMessage("user", "Can you help me prepare for Acme Corp?");
  assert(conv.title === "Can you help me prepare for Acme Corp?", "First user message should update conversation title");
  assert(conv.getMessages().length === 1, "Should have 1 message");

  conv.tagJobId("job-test-777");
  conv.tagJobId("job-test-777"); // Duplicate tag should be ignored
  assert(conv.job_ids.length === 1 && conv.job_ids[0] === "job-test-777", "tagJobId should deduplicate tags");

  // Serialization roundtrip
  const json = conv.toJSON();
  const rehydrated = Conversation.fromJSON(json);
  assert(rehydrated.id === conv.id, "Rehydrated ID should match");
  assert(rehydrated.title === conv.title, "Rehydrated title should match");
  assert(rehydrated.job_ids[0] === "job-test-777", "Rehydrated job_ids should match");
  assert(rehydrated.getMessages().length === 1, "Rehydrated messages length should match");
  console.log("✓ Conversation model, message ordering, and job tagging verified");

  // 1b. Test Compaction
  console.log("\n[Test 1b] Testing periodic conversation compaction...");
  const compactionConv = new Conversation();
  compactionConv.tagJobId("job-compaction-1");
  for (let i = 0; i < 15; i++) {
    compactionConv.addMessage(i % 2 === 0 ? "user" : "assistant", `Message turn ${i}`);
  }
  assert(compactionConv.getMessages().length === 15, "Should have 15 messages prior to compaction");
  const didCompact = compactionConv.compactHistory(12, 6);
  assert(didCompact === true, "compaction should trigger when count > 12");
  assert(compactionConv.getMessages().length === 7, "Should retain 1 system summary message + 6 recent turns");
  assert(compactionConv.getMessages()[0].role === "system", "First message should be the compaction summary");
  assert(compactionConv.getMessages()[0].content.includes("prior turns summarized"), "Summary message should contain compaction notice");
  assert(compactionConv.job_ids.includes("job-compaction-1"), "Job IDs must be preserved across compaction");
  console.log("✓ Periodic compaction reduced message footprint while strictly preserving context and job_ids");

  // 2. Test Tools with ToolContext
  console.log("\n[Test 2] Testing domain tools execution with real ToolContext...");
  const context: ToolContext = {
    repository,
    profile,
    conversation: conv,
  };

  // Tool A: GetJobDetailsTool
  const detailsTool = new GetJobDetailsTool();
  const detailsRaw = await detailsTool.execute({ job_id: "job-test-777" }, context);
  const details = JSON.parse(detailsRaw);
  assert(details.id === "job-test-777", "get_job_details should return the correct job");
  assert(details.company === "Acme Corp", "get_job_details should return company");
  console.log("✓ GetJobDetailsTool successfully executed");

  // Tool B: AnalyzeQualificationFitTool
  const fitTool = new AnalyzeQualificationFitTool();
  const fitRaw = await fitTool.execute({ job_id: "job-test-777" }, context);
  const fit = JSON.parse(fitRaw);
  assert(fit.overallFitScore > 0, "analyze_qualification_fit should return positive score");
  assert(fit.matchedQualifications.length > 0, "analyze_qualification_fit should match candidate skills");
  console.log(`✓ AnalyzeQualificationFitTool executed with score: ${fit.overallFitScore}`);

  // Tool C: DraftCoverLetterTool
  const letterTool = new DraftCoverLetterTool();
  const letterRaw = await letterTool.execute({ job_id: "job-test-777", notes: "Focus on cloud architecture" }, context);
  const letter = JSON.parse(letterRaw);
  assert(letter.suggestedSubjectLine.includes("Acme Corp"), "Cover letter subject line should mention company");
  assert(letter.coverLetterText.includes("Focus on cloud architecture"), "Cover letter should incorporate user notes");
  console.log("✓ DraftCoverLetterTool successfully incorporated user notes");

  // Tool D: GenerateInterviewPrepTool
  const prepTool = new GenerateInterviewPrepTool();
  const prepRaw = await prepTool.execute({ job_id: "job-test-777" }, context);
  const prep = JSON.parse(prepRaw);
  assert(prep.questions.technical.length > 0, "Interview prep should generate technical questions");
  assert(prep.company === "Acme Corp", "Interview prep should associate with company");
  console.log("✓ GenerateInterviewPrepTool successfully generated role-specific questions");

  // Tool E: SearchSavedJobsTool
  const searchTool = new SearchSavedJobsTool();
  const searchRaw = await searchTool.execute({ company: "Acme" }, context);
  const search = JSON.parse(searchRaw);
  assert(search.totalMatches >= 1, "search_saved_jobs should find seeded job");
  assert(search.jobs[0].company === "Acme Corp", "search_saved_jobs should return Acme Corp");
  console.log("✓ SearchSavedJobsTool successfully queried database");

  // Tool F: NameConversationTool
  const nameTool = new NameConversationTool();
  const nameRaw = await nameTool.execute({ title: "Acme Distributed Systems Fit" }, context);
  const nameRes = JSON.parse(nameRaw);
  assert(nameRes.success === true, "name_conversation should succeed");
  assert(conv.title === "Acme Distributed Systems Fit", "Conversation title must be updated");
  console.log("✓ NameConversationTool successfully assigned descriptive conversation title");

  // 3. Test Agent Offline Resilience & Execution
  console.log("\n[Test 3] Testing GeminiAgent multi-turn execution and fallback resilience...");
  const agent = new GeminiAgent({ apiKey: "" });
  const turnResult = await agent.run("Search for jobs at Acme", conv, { repository, profile });
  assert(typeof turnResult.text === "string" && turnResult.text.length > 0, "Agent turn should return response text");
  assert(conv.getMessages().length === 3, "Conversation should now contain 3 messages (user, assistant)");
  const lastMsg = conv.getMessages()[2];
  assert(lastMsg.role === "assistant", "Last message should have role 'assistant'");
  console.log("✓ GeminiAgent executed turn and recorded messages successfully");

  // 4. Test Conversation Persistence in Repository
  console.log("\n[Test 4] Testing conversation persistence in repository...");
  await repository.saveConversation(conv);

  const loadedConv = await repository.getConversation(conv.id);
  assert(loadedConv !== null, "Repository should retrieve saved conversation");
  assert(loadedConv?.id === conv.id, "Retrieved ID should match");
  assert(loadedConv?.job_ids.includes("job-test-777") === true, "Retrieved conversation should retain tagged job_ids");

  const jobConvList = await repository.listConversations({ jobId: "job-test-777" });
  assert(jobConvList.length === 1, "listConversations({ jobId }) should return tagged conversation");
  console.log("✓ Conversation repository persistence and job_ids filtering verified");

  // Cleanup test store
  if (fs.existsSync(testStorePath)) fs.unlinkSync(testStorePath);

  console.log("\n==========================================================");
  console.log("    ALL AGENT & TOOL TESTS PASSED WITH 100% SUCCESS!      ");
  console.log("==========================================================\n");
}

runAgentSuite().catch((err) => {
  console.error("Agent verification suite failed:", err);
  process.exit(1);
});
