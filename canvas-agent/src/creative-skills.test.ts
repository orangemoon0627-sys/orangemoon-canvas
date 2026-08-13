import assert from "node:assert/strict";
import test from "node:test";

import { CREATIVE_SKILL_IDS, getCreativeSkill, listCreativeSkills } from "./creative-skills.js";
import { CanvasSession } from "./canvas-session.js";

test("lists creative skill summaries without loading full instructions", () => {
    const skills = listCreativeSkills();
    assert.deepEqual(skills.map((skill) => skill.id), [...CREATIVE_SKILL_IDS]);
    assert.equal(skills.every((skill) => !("instructions" in skill)), true);
    assert.equal(skills.every((skill) => skill.sourceCount > 0), true);
});

test("returns a pinned and licensed creative skill", () => {
    const skill = getCreativeSkill("seedance2-director");
    assert.match(skill.instructions, /2 至 5 个/);
    assert.match(skill.instructions, /431-Seedream-2\.0-fast、431-Seedream-2\.0、qy-seedance-2\.5、qy-seedance-2\.0-fast、qy-seedance-2\.0/);
    assert.doesNotMatch(skill.instructions, /清衍独家|两个独家/);
    assert.match(skill.instructions, /431 两款最多 4 图\/3 视频\/1 音频/);
    assert.match(skill.instructions, /Seedance 2\.5 支持 4-29 秒任意整数/);
    assert.match(skill.instructions, /不要创建或调用 Seedance 2\.0-fast-720p/);
    assert.doesNotMatch(skill.instructions, /Seedance 2\.0 Mini/);
    assert.equal(skill.sources.every((source) => source.license === "MIT" && /^[a-f0-9]{40}$/.test(source.commit)), true);
});

test("serves creative skills without requiring a connected canvas", async () => {
    const session = new CanvasSession();
    const listed = await session.callTool("creative_skills_list", {}) as { skills: Array<{ id: string }> };
    assert.equal(listed.skills.length, 3);

    const selected = await session.callTool("creative_skill_get", { id: "video-prompt-reverse" }) as { skill: { id: string; instructions: string } };
    assert.equal(selected.skill.id, "video-prompt-reverse");
    assert.match(selected.skill.instructions, /不能恢复创作者当时输入的原始提示词/);
    assert.match(selected.skill.instructions, /最多选择 8 帧进入视觉分析/);
    assert.match(selected.skill.instructions, /至少替换五类/);
});
