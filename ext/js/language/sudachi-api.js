/*
 * Copyright (C) 2024  Yomitan Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {log} from '../core/log.js';

/**
 * Client for the Sudachi morphological analysis API.
 */
export class SudachiApiClient {
    constructor() {
        /** @type {string} */
        this._apiUrl = 'http://127.0.0.1:8000';
        /** @type {number} */
        this._timeout = 5000;
        /** @type {string|null} */
        this._cachedSentence = null;
        /** @type {Array<{surface: string, jishokei: string, start: number, end: number}>|null} */
        this._cachedTokens = null;
    }

    /**
     * Gets the dictionary form (辞書形) of the word at the cursor position.
     * @param {string} sentence The sentence containing the target text.
     * @param {number} cursorIndex The cursor position (character index) in the sentence.
     * @returns {Promise<{jishokei: string, length: number, offset: number}|null>} The dictionary form, source length, and offset, or null if failed.
     */
    async getJishokei(sentence, cursorIndex) {
        // 检查缓存：如果句子相同，直接从缓存中查找
        if (this._cachedSentence === sentence && this._cachedTokens !== null) {
            const token = this._findTokenAtCursor(cursorIndex);
            if (token !== null) {
                return {
                    jishokei: token.jishokei,
                    length: token.end - token.start,
                    offset: token.start,
                };
            }
            return null;
        }

        // 缓存未命中，请求后端
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this._timeout);

            const response = await fetch(this._apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sentence: sentence,
                    cursor_index: cursorIndex,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                log.warn(`Sudachi API error: ${response.status}`);
                return null;
            }

            /** @type {{tokens: Array<{surface: string, jishokei: string, start: number, end: number}>, current: {surface: string, jishokei: string, start: number, end: number}|null}} */
            const data = await response.json();

            // 更新缓存
            this._cachedSentence = sentence;
            this._cachedTokens = data.tokens;

            if (data.current === null) {
                return null;
            }

            return {
                jishokei: data.current.jishokei,
                length: data.current.end - data.current.start,
                offset: data.current.start,
            };
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                log.error('Sudachi API request timed out');
            } else {
                log.error(error);
            }
            return null;
        }
    }

    /**
     * Finds the token at the given cursor position from cache.
     * @param {number} cursorIndex The cursor position.
     * @returns {{surface: string, jishokei: string, start: number, end: number}|null} The token at cursor, or null if not found.
     */
    _findTokenAtCursor(cursorIndex) {
        if (this._cachedTokens === null) {
            return null;
        }
        for (const token of this._cachedTokens) {
            if (token.start <= cursorIndex && cursorIndex < token.end) {
                return token;
            }
        }
        return null;
    }
}
