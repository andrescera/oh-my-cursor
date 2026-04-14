#!/usr/bin/env bun
import { z } from "../hooks/node_modules/zod"
import { OhMyCursorConfigSchema } from "../hooks/schemas/config"
import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, "..")
const distDir = join(repoRoot, "dist")
const outPath = join(distDir, "oh-my-cursor.schema.json")

const jsonSchema = z.toJSONSchema(OhMyCursorConfigSchema, { target: "draft-2020-12" })

if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true })
writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2))
console.log("Schema written to dist/oh-my-cursor.schema.json")
