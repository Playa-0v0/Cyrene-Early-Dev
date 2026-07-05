"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportCsv = exportCsv;
// CSV 导出：每轮每条目一行
// 列：round, entryId, intrinsicValue, priority, activation, userSilence, modelSilence, state, userHit, modelHit
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function exportCsv(result, outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    const file = path.join(outputDir, `${result.scenario}.csv`);
    const lines = ["round,entryId,intrinsicValue,priority,activation,userSilence,modelSilence,state,userHit,modelHit"];
    for (let r = 0; r < result.snapshots.length; r++) {
        for (const s of result.snapshots[r]) {
            lines.push([
                r,
                s.entryId,
                s.intrinsicValue,
                s.priority,
                s.activation.toFixed(3),
                s.userSilence,
                s.modelSilence,
                s.state,
                s.userHit ? 1 : 0,
                s.modelHit ? 1 : 0,
            ].join(","));
        }
    }
    fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");
    return file;
}
