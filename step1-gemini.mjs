import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getGeminiModel } from "./gemini-config.js";
import { SYSTEM_INSTRUCTION } from "./system-instruction.js";

// Replace the excerpts with three excerpts from one real story before
// judging output quality. Labels are inputs supplied by the builder, not inferred.
const STORY = {
  headline: "Trump's Venezuela oil deal",
  sources: [
    {
      source_name: "Pbs News",
      bias_label: "left",
      excerpt: `<p>What we know about Trump's deal giving U.S. access to vast oil reserves in Venezuela</p><p>Politics Updated on Aug 30, 2026 6:14 PM EDT — Published on Aug 29, 2026 3:44 PM EDT</p><p>WASHINGTON (AP) — Besides a social media post from President Donald Trump, the White House has said little about what he is calling "THE BIGGEST OIL DEAL IN WORLD HISTORY" in Venezuela.</p><p>Trump said the agreement announced Friday night would give the United States a stake in Venezuela's vast oil reserves, a step toward his goal of extracting energy from the country after American forces captured then-President Nicolás Maduro in a middle-of-the-night raid in January and brought him to New York to face federal drug trafficking charges.</p><p>Venezuela's acting president, Delcy Rodríguez, described the deal as a step toward economic recovery that will modernize the country's oil industry. In a televised address to the nation late Saturday, Rodríguez insisted Venezuela's sovereignty is secure and said she wants the country to become a global energy powerhouse.</p><p>Earlier on Saturday, she said the oil reserves would "cease to be an inert, cold statistic and will instead become concrete solutions. Housing is one of them."</p><p>But the answers to many questions, including how soon the reserves could be drilled and who will pay to make it happen, were not immediately clear. No text of any agreement has been released.</p><p>A look at what is known and unknown:</p><p>What are the terms?</p><p>The U.S. government and an unnamed private operator in Venezuela formed a new company that was given the rights to untapped oil fields for 100 years.</p><p>The administration appears to be trying to find ways to make it easier for the private sector to invest in Venezuela's industry through the deal, said Bob McNally, who was an energy adviser in former President George W. Bush's White House. "However, investors will remain cautious even if the terms of the deal, once released, pass legal muster. A future president could withdraw, and Caracas has twice thrown foreign investors out," McNally said.</p><p>A statement from Rodríguez said the deal involves the development of 17 fields with a proven potential of 65 billion barrels. It said the agreement could draw $100 billion in investment into Venezuela's oil industry and yield over $209 billion in taxes for Caracas.</p><p>Trump said the agreement was negotiated by Secretary of State Marco Rubio, Defense Secretary Pete Hegseth and Rodríguez.</p><p>The deal gives the United States 55% effective output of the new private company, including an ownership stake and rights to buy oil at cost. American purchases of the oil will go toward the U.S. strategic oil reserves along with the military, according to a U.S. official who was not authorized to discuss the matter publicly and spoke on the condition of anonymity.</p><p>The company would be the second largest corporate holder of proven reserves after Saudi Aramco, according to the official.</p><p>Amos Hochstein, who was a senior energy adviser to former President Joe Biden, said the deal is uncharted territory from a legal and diplomatic perspective. It carries tremendous risk for companies thinking about doing business under the new arrangement, he said. Democrats could challenge the deal if they regain power in Washington, as could future administrations in Venezuela.</p><p>"There will be a lot of challenges to what was just announced," Hochstein said. "I can only say, if it were me, I'd be nervous. And if I'm back in my old job in the next administration, then they should be nervous."</p><p>Will gas prices go down?</p><p>Probably not any time soon.</p><p>Trump says the deal will help lower gas prices for Americans. That is an important objective for the Republican president as the Iran war slows the shipping of Persian Gulf oil and keeps prices elevated months before November elections in the United States.</p><p>But experts have repeatedly warned that Venezuela's dilapidated oil infrastructure will take years and billions of dollars to repair. A substantial boost in production is not expected to happen quickly.</p><p>The deal could be "helpful in the long run, but it's not going to do anything to change the price of gasoline at the retail station for Labor Day weekend," said Amy Myers Jaffe, director of the Energy, Climate Justice and Sustainability Lab at New York University.</p><p>Neither side made clear who would pay for infrastructure investments and at what cost.</p><p>The average price of gas in the U.S. stood at about $4.08 a gallon on Saturday, according to AAA. The average price was $3.20 at the same time last year.</p><p>Kevin Book, managing director at ClearView Energy Partners, said the oil industry is awaiting clarity on the deal's details. Venezuela has room to increase its oil production, he said — in the past it produced more than 2.5 million barrels a day above current levels — but investments of this scale don't happen quickly.</p><p>"It's going to take time — many years — to deploy that much capital and produce the kind of incremental results that history suggests possible," Book said.</p><p>How will Venezuelans react?</p><p>Some in Venezuela considered it a betrayal of what their government has stated repeatedly for decades: Venezuelan resources are for Venezuela, and leaders would not allow the U.S. government access to those resources.</p><p>At a market in eastern Caracas on Saturday, Douglas Borjas said he was upset about the announcement.</p><p>"I think they're doing it to cling to power," he said of Venezuela's leaders. "It's like, 'I'm giving you a vast amount of petroleum as long as you leave me alone here in power.'"</p><p>He added: "The Venezuelan people deserve better. Venezuela has resources that can be exploited, but for the benefit of the people, not for the benefit of the corrupt elite."</p><p>Harvard University professor Ricardo Hausmann, a former Venezuelan planning minister, called it a "shameful deal."</p><p>"Venezuelans will not respect this illegitimate deal and no major US oil company will take it seriously because they know it will not last," Hausmann said on social media, adding that Rodríguez "has no legitimacy or constitutional power to commit Venezuela to any such deal."</p><p>In her national address, Rodríguez pushed back on some of the early criticism.</p><p>"One thing must be absolutely clear: Venezuela retains ownership and sovereignty over its resources," Rodríguez said. She said the goal is to reach other agreements with transnational private companies such as Chevron, Repsol and Shell.</p><p>She added: "We want to be an energy powerhouse, a major oil producer, a significant gas exporter, and a major national petrochemical developer."</p><p>What's the reaction on Capitol Hill?</p><p>It is unclear whether Congress will play a role in the arrangement, but lawmakers from both parties were quick to weigh in.</p><p>Trump allies called it a win.</p><p>Sen. Bernie Moreno, R-Ohio, said it was a historic deal that helps both countries. "If it were up to DC Democrats, Maduro would still be in power, Venezuelan oil would be going to China at half price, and the people of Venezuela would be getting robbed by a corrupt regime," Moreno wrote on social media.</p><p>It was condemned by Democrats who said Maduro's capture was a means to this end.</p><p>Sen. Tim Kaine, D-Va., said Trump was always after Venezuela's oil, branding it "corruption at epic scale."</p><p>"Will prices come down for Americans? Who knows but likely not as much as Trump has forced them up thru his idiotic Iran War," Kaine said on social media.</p><p>Sen. Chris Van Hollen, D-Md., said Trump "put our service members at risk to get Venezuelan oil for his billionaire buddies."</p><p>What questions remain?</p><p>Many important details remain unclear, including who will cover necessary investments, the identity of the private operator and how America's stake in the company breaks down.</p><p>The U.S. will get 55% of the company's effective output, but it was not clear what portion of that comes from an ownership stake and how much comes from the right to buy oil at cost.</p><p>It also is unclear how the industry will react. Persuading big American oil companies to return to the region could prove a challenge given the political uncertainty and damaged infrastructure.</p><p>Chevron, the only U.S. oil company actively producing in Venezuela, declined to comment. Separately from Trump's announcement, Chevron already had been in talks to expand investment in the country. Exxon Mobil also declined to comment.</p><p>David Oxley, chief climate and commodities economist at Capital Economics, said that on its face, the deal could double U.S. oil reserves and reduce dependence on crude oil from Canada and Mexico. But Oxley, writing in a commentary, cautioned that there are logistical hurdles and said the value of Venezuela's reserves may have been exaggerated under former President Hugo Chavez.</p><p>Even with legal and security guarantees, it is not clear that U.S. oil companies "would be eager to invest," he wrote, noting that "there simply might be more enticing commercial opportunities on offer elsewhere."</p>`
    },
    {
      source_name: "BBC News",
      bias_label: "center",
      excerpt: `<p>Trump hails 'historic' deal for US to control 65bn barrels of Venezuela's oil</p><p>30 August 2026</p><p>The US has struck a deal with Venezuela to control more than 65 billion barrels of its proven oil reserves, Donald Trump said.</p><p>The US president wrote that the agreement would more than double American oil reserves and "substantially lower Gas Prices for all Americans".</p><p>In a late-night address on Saturday, Venezuela's interim President Delcy Rodríguez hailed the deal as one that would help her nation's economic revival.</p><p>But some analysts have reacted with scepticism, including questioning whether it would address long-running obstacles that have deterred investment in its oil industry.</p><p>Trump has recently been under domestic pressure to tame petrol prices, which have spiked due to the Iran war.</p><p>He vowed to tap into Venezuela's reserves, the world's largest, after the US captured its then-President Nicolás Maduro in January, ostensibly to stand trial on drug charges in New York.</p><p>Rodriguez, who is Maduro's former vice-president and who the US backed following his capture, said on Saturday that the energy agreement with the US would remain in force for 25 years.</p><p>She said it would target an increase in crude output to 1.5 million barrels per day and preserve the country's sovereignty over its natural resources.</p><p>Rodriguez hailed the accord as a "historic" deal that would help revive the economy and boost government revenue, saying it would help shape the country's future.</p><p>Earlier, she said in a statement that the deal calls for the development of 17 strategic oil fields with a proven potential of 65 billion barrels, as well as "an investment of more than $100bn and more than $209bn in taxes" for Venezuela.</p><p>"These investments will contribute not only to the recovery and modernisation of our industry, but also to our country's economic growth, the energy security of our hemisphere and greater balance in international markets," she said.</p><p>Under the agreement, the US government will retain 55% control of a joint venture with an "experienced private operator in Venezuela", a US official told the BBC's US partner CBS News.</p><p>They said Rodríguez gave the venture a 100-year concession to operate in the oil fields.</p><p>US Secretary of State Marco Rubio called the deal "a huge win for both the American and Venezuelan people".</p><p>"For the Venezuelan people, this deal will bring nearly $100bn (£74bn) in private investment, support thousands of high-paying jobs and drive the reconstruction of Venezuela's economy," he said.</p><p>Trump said Rubio and Defence Secretary Pete Hegseth had reached the agreement with Venezuela's leadership "through a partnership with private business".</p><p>He gave few specifics, nor did he elaborate on the partnership or describe possible US terms and commitments, but he said the deal was reached "at no cost to the American Taxpayer".</p><p>It apparently grants the US direct governance over a foreign country's sovereign national resources and appears to be wider in scope than the US-led Coalition Provisional Authority's control over Iraq's oil revenues after Saddam Hussein was ousted in an American-led invasion in 2003.</p><p>It is unclear whether the Venezuela agreement could face legal and constitutional challenges in the South American nation. The official text of the agreement between Washington and Caracas has not been published.</p><p>Henrique Capriles, a moderate opposition lawmaker in Venezuela, said there were many doubts about the agreement because of the "opacity and corruption" of the government.</p><p>He said the government needed to explain the legal basis for the agreement under the Constitution and what the Venezuelan people were going to receive from it.</p><p>David Goldwyn, president of energy consultancy Goldwyn Global Strategies, told the Reuters news agency there was "no precedent" for the US government entering into a lease to operate Venezuelan oil fields and it was not clear if such a move would violate Venezuela's constitution or its hydrocarbons law.</p><p>"It is hard to see how this kind of arrangement would accelerate investment at any material scale," he added, citing Venezuela's political uncertainty, weak power grid, and limited export capacity.</p><p>Oil, gas and mineral lawyer Alexander Kuiper told the BBC the deal could be "very significant" but expressed some caution.</p><p>"This is definitely a headline to help with oil prices," he said, but added: "What we don't know, is whether or not those reserves turn into actual investment, and how long that investment takes to produce results."</p><p>Rachel Ziemba, from think tank The Center for New American Security, said the agreement could help spur job growth and imports in Venezuela, but there were too few details to gauge the impact.</p><p>“This is unlikely to have any material impact on global oil supplies in the next month or even the next year,” she told the BBC News Channel.</p><p>The Wall Street Journal reported on Friday that US energy firms Chevron and Halliburton were nearing deals to invest billions in overhauling the infrastructure in Venezuela's oil fields, many of which have not been developed.</p><p>Venezuela has the largest proven oil reserves in the world - an estimated 303 billion barrels - but production has plummeted since its peak in the late 1990s, in part due to a tightening of controls over its state-run oil firm and US sanctions targeting its main economic lifeline.</p><p>Hours after US special forces captured Maduro and his wife, Cilia Flores, in a raid on the Venezuelan capital, Trump said the US would indefinitely control the sale of the country's oil.</p><p>He has also claimed the rights to Venezuela's oil after saying that the country had in the past "unilaterally seized and sold American oil, American assets and American platforms, costing us billions and billions of dollars".</p><p>His framing of the deal as part of efforts to drive down domestic petrol prices comes as the global price of oil has jumped up significantly as supply via the Strait of Hormuz in the Persian Gulf has effectively been stymied - spurring discontent ahead of the US midterm elections in November.</p><p>However, Venezuela's oil reserves are made up of so-called "heavy, sour" oil, which is harder to refine and used for making diesel and asphalt, while the US typically produces "light, sweet" oil useful for making petrol.</p><p>Trump has asked US oil firms to invest at least $100bn (£75bn) to restore the country's oil industry.</p>`
    },
    {
      source_name: "Fox News",
      bias_label: "right",
      excerpt: `<p>Trump just brokered a deal with the country sitting atop the world’s largest oil reserves</p><p>Venezuela controls world's largest oil reserves with over 300 billion barrels</p><p>Venezuelan heavy crude poised to benefit US Gulf Coast refineries and ease fuel prices</p><p>President Donald Trump’s new oil agreement with Venezuela could give the United States access to a 65 billion-barrel crude-oil prize — an energy-security win, even if drivers are unlikely to see benefits quickly.</p><p>The deal announced Friday would give the U.S. a stake in 17 Venezuelan oil fields holding an estimated 65 billion barrels of crude, according to Venezuela’s government.</p><p>Venezuela controls more than 300 billion barrels of crude reserves, roughly 20% of the world’s total. It is the largest oil stockpile on the planet, exceeding even Saudi Arabia’s.</p><p>Yet Venezuela has long struggled to turn that oil wealth into steady production. Political instability and deteriorating infrastructure have left the country producing only about 1% of the world’s oil despite holding an estimated 17% of global reserves.</p><p>For Trump, the potential benefit goes beyond the deal’s headline number.</p><p>Venezuela produces heavy crude, the type many Gulf Coast refineries were designed to process. Much U.S. production is lighter shale crude, while Gulf Coast refiners have historically relied on heavier imports from Canada, Mexico and Venezuela.</p><p>A steadier Venezuelan supply could support Gulf Coast refineries, diversify U.S. oil imports and provide a buffer against future supply disruptions. It could also help replenish the Strategic Petroleum Reserve, which remains well below its 714 million-barrel authorized capacity.</p><p>That prospect has taken on added importance as the war with Iran disrupts oil shipments through the Strait of Hormuz. The average U.S. price for regular gasoline stood at about $4.07 a gallon Sunday, according to AAA, compared with roughly $3.19 a year earlier.</p><p>For Trump, the deal is a bet that long-term access to Venezuelan heavy crude can strengthen U.S. energy security and eventually ease costs for Americans.</p><p>Whether it translates into relief at the pump will depend on how quickly Venezuela can turn its vast reserves into market-ready barrels.</p>`
    }
  ]
};

const MODEL = getGeminiModel();
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
const OUTPUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "output");

function buildUserPrompt(story) {
  const sources = story.sources
    .map(
      ({ source_name, bias_label, excerpt }, index) =>
        `Source ${index + 1}\nsource_name: ${source_name}\nbias_label: ${bias_label}\nexcerpt:\n${excerpt}`
    )
    .join("\n\n---\n\n");

  return `Compare the three source excerpts below about one story. Base every statement only on the supplied text.\n\nHeadline: ${story.headline}\n\n${sources}`;
}

function buildRequestBody() {
  return {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts: [{ text: buildUserPrompt(STORY) }] }],
    generationConfig: { temperature: 0.2 }
  };
}

function extractText(payload) {
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    const reason = payload.promptFeedback?.blockReason || "No text candidate returned";
    throw new Error(`Gemini returned no usable output: ${reason}`);
  }
  return text;
}

async function main() {
  const requestBody = buildRequestBody();

  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ model: MODEL, requestBody }, null, 2));
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. See README.md for PowerShell setup.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(requestBody)
  });

  const payload = await response.json();
  if (!response.ok) {
    const apiError = payload.error || {};
    const details = Array.isArray(apiError.details)
      ? apiError.details
          .map((detail) => detail.reason || detail.errorInfo?.reason || detail.message)
          .filter(Boolean)
          .join(", ")
      : "";
    const description = [
      apiError.status,
      apiError.message || response.statusText,
      details
    ]
      .filter(Boolean)
      .join(": ");
    throw new Error(`Gemini API request failed (${response.status}): ${description}`);
  }

  const result = extractText(payload);
  await mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, "latest.txt");
  await writeFile(outputPath, `${result}\n`, "utf8");

  console.log(result);
  console.log(`\nSaved for manual review: ${outputPath}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
