// ===== Lexer (IDENTIQUE à la version que vous avez fournie) =====
class Lexer {
	constructor(code) {
		this.code = code;
		this.cursor = 0;
		this.line = 1;
		this.col = 1;
		this.tokenHistory = [];
	}

	isEOF() {
		return this.cursor >= this.code.length;
	}

	peek(offset = 0) {
		if (this.cursor + offset >= this.code.length) return '';
		return this.code[this.cursor + offset];
	}

	advance() {
		const char = this.code[this.cursor];
		if (this.cursor < this.code.length) {
			if (char === '\n') {
				this.line++;
				this.col = 1;
			} else {
				this.col++;
			}
			this.cursor++;
		}
		return char;
	}

	skipWhitespaceAndComments() {
		while (!this.isEOF()) {
			const char = this.peek();
			const nextChar = this.peek(1);

			if (/\s/.test(char)) {
				this.advance();
			} else if (char === '/' && nextChar === '/') {
				while (!this.isEOF() && this.peek() !== '\n') {
					this.advance();
				}
			} else if (char === '#' && nextChar !== '{') {
				while (!this.isEOF() && this.peek() !== '\n') {
					this.advance();
				}
			}
			else {
				break;
			}
		}
	}

	makeToken(type, value, locDetails = {}) {
		const tokenLength = String(value === null || value === undefined ? "" : value).length;
		const currentLine = locDetails.line !== undefined ? locDetails.line : this.line;
		let currentCol = locDetails.col !== undefined ? locDetails.col : this.col;

		if (locDetails.col === undefined) {
			currentCol = this.col - tokenLength;
			if (currentCol < 1) currentCol = 1;
		}

		const token = {
			type,
			value,
			line: currentLine,
			col: currentCol
		};
		this.tokenHistory.push(token);
		return token;
	}

	scanString(quoteType) {
		let value = '';
		const startLine = this.line;
		const startCol = this.col;
		this.advance();

		while (!this.isEOF()) {
			const currentChar = this.peek();
			if (currentChar === quoteType) {
				break;
			}
			if (currentChar === '\\') {
				value += this.advance();
				if (this.isEOF()) throw new Error(`Unterminated string escape at ${this.line}:${this.col}`);
				value += this.advance();
			} else if (quoteType === '`' && currentChar === '$' && this.peek(1) === '{') {
				value += this.advance();
				value += this.advance();
				let braceDepth = 1;
				while (!this.isEOF() && braceDepth > 0) {
					const interpChar = this.advance();
					value += interpChar;

					if (interpChar === '{' && !(value.endsWith('${') && value.length === 2)) {
						braceDepth++;
					} else if (interpChar === '}') {
						braceDepth--;
					}

					if (braceDepth === 0) {
						break;
					}
					if (this.isEOF() && braceDepth > 0) throw new Error(`Unterminated template literal expression at ${startLine}:${startCol}`);
				}
			} else {
				value += this.advance();
			}
		}
		if (this.isEOF() || this.peek() !== quoteType) {
			throw new Error(`Unterminated string literal (type: ${quoteType}) starting at ${startLine}:${startCol}. Expected ${quoteType} but got EOF or "${this.peek()}". Value so far: "${value.slice(0,50)}"`);
		}
		this.advance();

		return this.makeToken('STRING', value, { line: startLine, col: startCol });
	}

	scanNumber() {
		let valueStr = '';
		const startLine = this.line;
		const startCol = this.col;
		while (!this.isEOF() && /\d/.test(this.peek())) {
			valueStr += this.advance();
		}
		if (this.peek() === '.' && /\d/.test(this.peek(1))) {
			valueStr += this.advance();
			while (!this.isEOF() && /\d/.test(this.peek())) {
				valueStr += this.advance();
			}
			return this.makeToken('NUMBER', parseFloat(valueStr), { line: startLine, col: startCol });
		}
		return this.makeToken('NUMBER', parseInt(valueStr), { line: startLine, col: startCol });
	}

	scanIdentifierOrKeyword() {
		let value = '';
		const startLine = this.line;
		const startCol = this.col;
		while (!this.isEOF() && /[a-zA-Z_0-9]/.test(this.peek())) {
			value += this.advance();
		}

		const keywords = {
			"def": "DEF", "end": "END", "do": "DO", "wait": "WAIT", "compute": "COMPUTE",
			"if": "IF", "else": "ELSE", "then": "THEN", "true": "TRUE", "false": "FALSE", "null": "NULL",
			"return": "RETURN", "log": "LOG_KW", "puts": "PUTS_KW",
			"const": "CONST", "let": "LET", "var": "VAR", "function": "FUNCTION_KW",
			"new": "NEW", "this": "THIS", "typeof": "TYPEOF", "instanceof": "INSTANCEOF"
		};
		const type = keywords[value] || "IDENTIFIER";
		return this.makeToken(type, value, { line: startLine, col: startCol });
	}

	scanSymbol() {
		const startLine = this.line;
		const startCol = this.col;
		this.advance();
		let value = '';
		if (/[a-zA-Z_]/.test(this.peek())) {
			while (!this.isEOF() && /[a-zA-Z_0-9]/.test(this.peek())) {
				value += this.advance();
			}
			return this.makeToken('SYMBOL', value, { line: startLine, col: startCol });
		} else {
			return this.makeToken('COLON', ':', { line: startLine, col: startCol });
		}
	}

	nextToken() {
		this.skipWhitespaceAndComments();
		if (this.isEOF()) return this.makeToken('EOF', null);

		const currentLine = this.line;
		const currentCol = this.col;
		const char = this.peek();
		const nextChar = this.peek(1);

		if (char === '"' || char === "'" || char === '`') return this.scanString(char);
		if (/\d/.test(char)) return this.scanNumber();
		if (/[a-zA-Z_]/.test(char)) return this.scanIdentifierOrKeyword();

		if (char === ':') return this.scanSymbol();

		if (char === '#' && nextChar === '{') {
			const tok = this.makeToken('INTERPOLATION_START', '#{', { line: currentLine, col: currentCol });
			this.advance(); this.advance();
			return tok;
		}

		if (char === '=' && nextChar === '>') {
			const tok = this.makeToken('ARROW', '=>', { line: currentLine, col: currentCol });
			this.advance(); this.advance();
			return tok;
		}
		if (char === '=' && nextChar === '=') {
			const tokVal = this.peek(2) === '=' ? '===' : '==';
			const tokType = tokVal === '===' ? 'STRICT_EQ' : 'EQ';
			const tok = this.makeToken(tokType, tokVal, { line: currentLine, col: currentCol });
			this.advance(); this.advance(); if(tokVal === '===') this.advance();
			return tok;
		}
		if (char === '!' && nextChar === '=') {
			const tokVal = this.peek(2) === '=' ? '!==' : '!=';
			const tokType = tokVal === '!==' ? 'STRICT_NEQ' : 'NEQ';
			const tok = this.makeToken(tokType, tokVal, { line: currentLine, col: currentCol });
			this.advance(); this.advance(); if(tokVal === '!==') this.advance();
			return tok;
		}
		if (char === '<' && nextChar === '=') { const tok = this.makeToken('LTE', '<=', {line: currentLine, col: currentCol}); this.advance(); this.advance(); return tok;}
		if (char === '>' && nextChar === '=') { const tok = this.makeToken('GTE', '>=', {line: currentLine, col: currentCol}); this.advance(); this.advance(); return tok;}

		const singleCharTokens = {
			'(': 'LPAREN', ')': 'RPAREN', '{': 'LBRACE', '}': 'RBRACE',
			'[': 'LBRACKET', ']': 'RBRACKET', '|': 'PIPE', ',': 'COMMA',
			'.': 'DOT', '+': 'PLUS', '-': 'MINUS', '*': 'ASTERISK', '/': 'SLASH',
			'=': 'ASSIGN', '<': 'LT', '>': 'GT', ';': 'SEMICOLON', '?': 'QUESTION_MARK'
		};

		if (singleCharTokens[char]) {
			const tok = this.makeToken(singleCharTokens[char], char, { line: currentLine, col: currentCol });
			this.advance();
			return tok;
		}

		const prevTokens = this.tokenHistory.slice(-3).map(t => `${t.type}("${t.value}")@${t.line}:${t.col}`).join(' | ');
		throw new Error(`Unexpected character: "${char}" (ASCII: ${char.charCodeAt(0)}) at L${this.line}:C${this.col}. Previous tokens: [${prevTokens}] Context: "${this.code.substring(Math.max(0, this.cursor-10), this.cursor + 10)}"`);
	}

	tokenize() {
		const tokens = [];
		let token;
		this.tokenHistory = [];
		do {
			token = this.nextToken();
			tokens.push(token);
		} while (token.type !== 'EOF');
		return tokens;
	}
}


// ===== Parser (Avec corrections pour parseNewExpression et parseParameters) =====
class Parser {
	constructor(tokens) {
		this.tokens = tokens;
		this.pos = 0;
	}

	peek(offset = 0) {
		if (this.pos + offset >= this.tokens.length) return this.tokens[this.tokens.length - 1];
		return this.tokens[this.pos + offset];
	}
	current() { return this.tokens[this.pos]; }
	isEOF() { return this.current().type === 'EOF'; }

	consume(expectedTypeOrTypes) {
		const token = this.current();
		if (!token) throw new Error(`Unexpected EOF. Expected ${Array.isArray(expectedTypeOrTypes) ? expectedTypeOrTypes.join('|') : expectedTypeOrTypes}.`);
		const expected = Array.isArray(expectedTypeOrTypes) ? expectedTypeOrTypes : [expectedTypeOrTypes];
		if (expectedTypeOrTypes && !expected.includes(token.type)) {
			const contextTokens = this.tokens.slice(Math.max(0, this.pos - 2), Math.min(this.tokens.length, this.pos + 3));
			throw new Error(`Unexpected token type: ${token.type} ("${token.value}") at L${token.line}:C${token.col}. Expected ${expected.join('|')}. Context: ${JSON.stringify(contextTokens.map(t => ({ t: t.type, v: t.value, l: t.line, c: t.col })))}`);
		}
		this.pos++;
		return token;
	}

	parse() {
		const body = [];
		while (!this.isEOF()) {
			const stmt = this.parseStatementOrExpression();
			if (stmt) {
				body.push(stmt);
			} else if (!this.isEOF()) {
				this.consume();
			}
		}
		return { type: 'Program', body };
	}

	parseStatementOrExpression() {
		const token = this.peek();
		switch (token.type) {
			case 'DEF': return this.parseFunctionDefinition();
			case 'WAIT': return this.parseWaitBlock();
			case 'COMPUTE': return this.parseComputeBlock();
			case 'LOG_KW':
			case 'PUTS_KW': return this.parseLogOrPuts();
			case 'CONST':
			case 'LET':
			case 'VAR':
				return this.parseVariableDeclaration();
			case 'FUNCTION_KW':
				return this.parseJavaScriptFunctionDefinition();
			case 'IF':
				return this.parseIfStatement();
			case 'RETURN':
				return this.parseReturnStatement();
			case 'LBRACE':
				return this.parseBlockStatementNode();
			default:
				if (this.canStartExpression(token.type)) {
					return this.parseExpressionStatement();
				}
				if (this.isEOF()) return null;
				return this.parseJavaScriptContent();
		}
	}

	parseBlockStatementNode(isJsFunctionBody = false) {
		const startToken = this.consume('LBRACE');
		const body = [];
		while(!this.isEOF() && this.peek().type !== 'RBRACE') {
			const stmt = this.parseStatementOrExpression();
			if(stmt) body.push(stmt);
			else if (!this.isEOF() && this.peek().type !== 'RBRACE') this.consume();
		}
		this.consume('RBRACE');
		return { type: 'BlockStatement', body, line: startToken.line, col: startToken.col };
	}


	canStartExpression(tokenType) {
		return [
			'IDENTIFIER', 'THIS', 'LPAREN', 'LBRACKET', 'LBRACE',
			'STRING', 'NUMBER', 'TRUE', 'FALSE', 'NULL', 'SYMBOL',
			'NEW', 'MINUS', 'PLUS', 'TYPEOF',
			'FUNCTION_KW'
		].includes(tokenType);
	}

	parseExpressionStatement() {
		const startToken = this.current();
		const expr = this.parseExpression();
		if (!expr) return null;

		if (this.peek().type === 'SEMICOLON') {
			this.consume('SEMICOLON');
		}

		return { type: 'ExpressionStatement', expression: expr, line: startToken.line, col: startToken.col };
	}

	parseJavaScriptContent() {
		let codeFragments = [];
		const startToken = this.current();
		if (startToken.type === 'EOF') return null;

		let parenLevel = 0;
		let braceLevel = 0;
		let bracketLevel = 0;

		while (!this.isEOF()) {
			const t = this.peek();
			const isSquirrelKeyword = ['DEF', 'END', 'DO', 'WAIT', 'COMPUTE', 'IF'].includes(t.type);
			if (isSquirrelKeyword && parenLevel === 0 && braceLevel === 0 && bracketLevel === 0) {
				break;
			}

			if (t.type === 'DOT' && this.peek(1) && ['IDENTIFIER'].includes(this.peek(1).type) &&
				(this.peek(1).value === 'each' || this.peek(1).value === 'each_with_index') &&
				this.peek(2) && this.peek(2).type === 'DO' &&
				parenLevel === 0 && braceLevel === 0 && bracketLevel === 0) {
				break;
			}

			const consumedToken = this.consume();
			codeFragments.push(consumedToken);

			if (consumedToken.type === 'LPAREN') parenLevel++;
			else if (consumedToken.type === 'RPAREN') parenLevel = Math.max(0, parenLevel - 1);
			else if (consumedToken.type === 'LBRACE') braceLevel++;
			else if (consumedToken.type === 'RBRACE') braceLevel = Math.max(0, braceLevel - 1);
			else if (consumedToken.type === 'LBRACKET') bracketLevel++;
			else if (consumedToken.type === 'RBRACKET') bracketLevel = Math.max(0, bracketLevel - 1);

			if ( (consumedToken.type === 'SEMICOLON' || (consumedToken.type === 'RBRACE' && braceLevel === -1  ) ) &&
				parenLevel === 0 && bracketLevel === 0) {
				if (consumedToken.type === 'RBRACE' && braceLevel === -1) braceLevel = 0;
				break;
			}
			if (this.peek().line > consumedToken.line && parenLevel === 0 && braceLevel === 0 && bracketLevel === 0) {
				if (![',', 'PLUS', 'MINUS', 'ASTERISK', 'SLASH', 'ASSIGN', 'EQ', 'STRICT_EQ', 'NEQ', 'STRICT_NEQ', 'LT', 'GT', 'LTE', 'GTE', 'QUESTION_MARK', 'LPAREN', 'ARROW', 'DOT'].includes(consumedToken.type)) {
					break;
				}
			}
		}

		if (codeFragments.length === 0) {
			if(this.isEOF()) return null;
			return null;
		}

		let code = "";
		for(let i=0; i < codeFragments.length; i++) {
			const currentToken = codeFragments[i];
			const currentValueStr = String(currentToken.value === null || currentToken.value === undefined ? currentToken.type : currentToken.value);
			code += currentValueStr;

			if (i < codeFragments.length - 1) {
				const nextToken = codeFragments[i+1];
				const nextValueStr = String(nextToken.value === null || nextToken.value === undefined ? nextToken.type : nextToken.value);
				if (!currentValueStr.endsWith('(') && !currentValueStr.endsWith('[') && !currentValueStr.endsWith('.') &&
					!nextValueStr.startsWith(')') && !nextValueStr.startsWith(']') && !nextValueStr.startsWith('.') &&
					!nextValueStr.startsWith(',') && !nextValueStr.startsWith(';') && !nextValueStr.startsWith(':') &&
					!currentValueStr.endsWith(':') &&
					!(currentValueStr === '=' && nextValueStr === '>') &&
					!(currentValueStr === '#' && nextValueStr === '{')
				) {
					if (currentToken.type !== 'INTERPOLATION_START' && nextToken.type !== 'LBRACE' &&
						! ( (currentToken.type === 'IDENTIFIER' || currentToken.type.endsWith('_KW') || currentToken.type === 'THIS') && nextToken.type === 'LPAREN') &&
						! ( currentToken.type.endsWith('KW') && nextToken.type === 'IDENTIFIER' )
					) {
						code += " ";
					}
				}
			}
		}
		return { type: 'JavaScriptBlock', code: code.trim(), line: startToken.line, col: startToken.col };
	}

	parseParameters(isArrow = false) {
		const params = [];
		if (isArrow && this.peek().type === 'IDENTIFIER' && this.peek(1) && this.peek(1).type === 'ARROW') {
			const paramToken = this.consume('IDENTIFIER');
			params.push({ type: 'Parameter', name: paramToken.value, line: paramToken.line, col: paramToken.col });
			return params;
		}

		if (this.peek().type === 'LPAREN') {
			this.consume('LPAREN');
			if (this.peek().type !== 'RPAREN') {
				do {
					if (this.peek().type === 'RPAREN') break;

					let isRest = false;
					let isObjectPattern = false;
					let paramNameToken;
					let paramLine = this.peek().line;
					let paramCol = this.peek().col;

					if (this.peek().type === 'ASTERISK') {
						const asteriskToken = this.consume('ASTERISK');
						isRest = true;
						paramLine = asteriskToken.line;
						paramCol = asteriskToken.col;
						paramNameToken = this.consume('IDENTIFIER');
						params.push({ type: 'Parameter', name: paramNameToken.value, isRest, line: paramLine, col: paramCol });
					}
					else if (this.peek().type === 'LBRACE') {
						const lbraceToken = this.consume('LBRACE');
						isObjectPattern = true;
						paramLine = lbraceToken.line;
						paramCol = lbraceToken.col;
						if (this.peek().type === 'IDENTIFIER' && this.peek(1) && this.peek(1).type === 'RBRACE') {
							paramNameToken = this.consume('IDENTIFIER');
							this.consume('RBRACE');
							params.push({ type: 'Parameter', name: paramNameToken.value, isObjectPattern, line: paramLine, col: paramCol });
						} else {
							throw new Error(`Expected simple object destructuring like {arg} in parameter list at L${lbraceToken.line}:C${lbraceToken.col}. Found: ${this.peek().type}`);
						}
					}
					else if (this.peek().type === 'IDENTIFIER') {
						paramNameToken = this.consume('IDENTIFIER');
						params.push({ type: 'Parameter', name: paramNameToken.value, isRest: false, isObjectPattern: false, line: paramNameToken.line, col: paramNameToken.col });
					}
					else {
						throw new Error(`Unexpected token ${this.peek().type} ("${this.peek().value}") when parsing parameter at L${this.peek().line}:C${this.peek().col}. Expected IDENTIFIER, ASTERISK, or LBRACE.`);
					}

					if (this.peek().type === 'COMMA') {
						this.consume('COMMA');
						if (this.peek().type === 'RPAREN') break;
					} else {
						break;
					}
				} while (this.peek().type !== 'RPAREN' && !this.isEOF());
			}
			this.consume('RPAREN');
		} else if (!isArrow) {
			throw new Error(`Expected LPAREN for parameter list at L${this.peek().line}:C${this.peek().col} for non-arrow function.`);
		}
		return params;
	}

	parseBlockParams() {
		const params = [];
		if (this.peek().type === 'PIPE') {
			this.consume('PIPE');
			if (this.peek().type !== 'PIPE') {
				do {
					if (this.peek().type === 'PIPE') break;
					const paramToken = this.consume('IDENTIFIER');
					params.push({ type: 'Parameter', name: paramToken.value, line:paramToken.line, col:paramToken.col });
					if (this.peek().type === 'COMMA') {
						this.consume('COMMA');
						if (this.peek().type === 'PIPE') break;
					} else {
						break;
					}
				} while (this.peek().type !== 'PIPE' && !this.isEOF());
			}
			this.consume('PIPE');
		}
		return params;
	}

	parseFunctionDefinition() {
		const defToken = this.consume('DEF');
		const name = this.consume('IDENTIFIER');
		const params = this.parseParameters(false);
		const body = this.parseBlockScoped();
		this.consume('END');
		return { type: 'FunctionDefinition', id: name, params, body, line: defToken.line, col: defToken.col };
	}

	parseJavaScriptFunctionDefinition() {
		const funcToken = this.consume('FUNCTION_KW');
		let id = null;
		if (this.peek().type === 'IDENTIFIER') {
			id = this.consume('IDENTIFIER');
		}
		const params = this.parseParameters(false);
		const body = this.parseBlockStatementNode(true);
		return { type: 'JavaScriptFunctionDefinition', id, params, body, line: funcToken.line, col: funcToken.col };
	}

	parseBlockScopedJs() {
		const body = [];
		while (!this.isEOF() && this.peek().type !== 'RBRACE') {
			const stmt = this.parseStatementOrExpression();
			if (stmt) body.push(stmt);
			else if (!this.isEOF() && this.peek().type !== 'RBRACE') {
				this.consume();
			}
		}
		return { type: 'BlockStatement', body };
	}

	parseBlockScoped() {
		const body = [];
		const startToken = this.peek();
		while (!this.isEOF() && !['END', 'ELSE'].includes(this.peek().type)) {
			const stmt = this.parseStatementOrExpression();
			if (stmt) body.push(stmt);
			else if (!this.isEOF() && !['END', 'ELSE'].includes(this.peek().type)) {
				this.consume();
			}
		}
		return { type: 'BlockStatement', body, line: startToken.line, col: startToken.col };
	}

	parseIfStatement() {
		const ifToken = this.consume('IF');
		let test;
		const hasParen = this.peek().type === 'LPAREN';
		if (hasParen) this.consume('LPAREN');
		test = this.parseExpression();
		if (!test) throw new Error(`Missing test expression for IF statement at L${ifToken.line}:C${ifToken.col}`);
		if (hasParen) this.consume('RPAREN');

		if (this.peek().type === 'THEN') {
			this.consume('THEN');
		}

		const consequent = this.parseBlockScopedOrSingleStatement();
		let alternate = null;

		if (this.peek().type === 'ELSE') {
			this.consume('ELSE');
			if (this.peek().type === 'IF') {
				alternate = this.parseIfStatement();
			} else {
				alternate = this.parseBlockScopedOrSingleStatement();
			}
		}
		if (ifToken.value === 'if' && this.peek().type === 'END' && !(alternate && alternate.type === 'IfStatement')) {
			this.consume('END');
		}
		return { type: 'IfStatement', test, consequent, alternate, line: ifToken.line, col: ifToken.col };
	}

	parseBlockScopedOrSingleStatement() {
		const startToken = this.peek();
		if (startToken.type === 'DO') {
			this.consume('DO');
			const body = this.parseBlockScoped();
			return body;
		}
		if (startToken.type === 'LBRACE') {
			return this.parseBlockStatementNode();
		}
		const stmt = this.parseStatementOrExpression();
		return { type: 'BlockStatement', body: stmt ? [stmt] : [], line: startToken.line, col: startToken.col };
	}


	parseReturnStatement() {
		const returnToken = this.consume('RETURN');
		let argument = null;
		const nextToken = this.peek();
		if (!this.isEOF() && nextToken.type !== 'SEMICOLON' &&
			!['END', 'RBRACE', 'DEF', 'CONST', 'LET', 'VAR', 'IF', 'LOG_KW', 'PUTS_KW', 'FUNCTION_KW', 'ELSE', 'EOF'].includes(nextToken.type) &&
			(nextToken.line === returnToken.line ||
				(nextToken.line > returnToken.line && this.canStartExpression(nextToken.type))
			)
		) {
			argument = this.parseExpression();
		}
		if (this.peek().type === 'SEMICOLON') this.consume('SEMICOLON');
		return { type: 'ReturnStatement', argument, line: returnToken.line, col: returnToken.col };
	}


	parseWaitBlock() {
		const waitToken = this.consume('WAIT');
		const duration = this.consume('NUMBER');
		this.consume('DO');
		const params = this.parseBlockParams();
		const body = this.parseBlockScoped();
		this.consume('END');
		return { type: 'WaitBlock', duration, callback: { type: 'FunctionExpression', params, body }, line: waitToken.line, col: waitToken.col };
	}

	parseComputeBlock() {
		const computeToken = this.consume('COMPUTE');
		const arg1 = this.consume('NUMBER');
		this.consume('COMMA');
		const arg2 = this.consume('NUMBER');
		this.consume('DO');
		const params = this.parseBlockParams();
		if (params.length !== 1) throw new Error(`Compute callback expects 1 parameter, got ${params.length} at L${this.peek().line}`);
		const body = this.parseBlockScoped();
		this.consume('END');
		return { type: 'ComputeBlock', arg1, arg2, callback: { type: 'FunctionExpression', params, body }, line: computeToken.line, col: computeToken.col };
	}

	parseLogOrPuts() {
		const kwToken = this.consume();
		const argument = this.parseExpression();
		if (!argument) throw new Error(`Missing argument for ${kwToken.value} at L${kwToken.line}:C${kwToken.col}`);
		return { type: 'LogStatement', argument, line: kwToken.line, col: kwToken.col };
	}

	parseExpression() {
		const arrowAttempt = this.tryParseArrowFunctionExpression();
		if (arrowAttempt) return arrowAttempt;
		return this.parseAssignmentExpression();
	}

	tryParseArrowFunctionExpression() {
		const startPos = this.pos;
		const startToken = this.current();

		let paramsNode;

		if (startToken.type === 'IDENTIFIER' && this.peek(1) && this.peek(1).type === 'ARROW') {
			const paramToken = this.consume('IDENTIFIER');
			paramsNode = [{ type: 'Parameter', name: paramToken.value, line: paramToken.line, col: paramToken.col }];
		}
		else if (startToken.type === 'LPAREN') {
			let tempPos = startPos;
			tempPos++;
			let parenDepth = 1;
			let foundRparen = false;

			while(tempPos < this.tokens.length && this.tokens[tempPos].type !== 'EOF') {
				if (this.tokens[tempPos].type === 'LPAREN') parenDepth++;
				else if (this.tokens[tempPos].type === 'RPAREN') parenDepth--;

				if (parenDepth === 0 && this.tokens[tempPos].type === 'RPAREN') {
					foundRparen = true;
					break;
				}
				if (parenDepth < 0) {
					this.pos = startPos; return null;
				}
				tempPos++;
			}

			if (foundRparen && (tempPos + 1 < this.tokens.length) && this.tokens[tempPos + 1].type === 'ARROW') {
				paramsNode = this.parseParameters(true);
			} else {
				this.pos = startPos; return null;
			}
		} else {
			this.pos = startPos; return null;
		}

		if (this.peek().type !== 'ARROW') {
			this.pos = startPos;
			return null;
		}
		this.consume('ARROW');

		let body;
		if (this.peek().type === 'LBRACE') {
			body = this.parseBlockStatementNode(true);
		} else {
			body = this.parseAssignmentExpression();
			if (!body) throw new Error (`Missing body for arrow function at L${startToken.line}:C${startToken.col}`);
		}
		return { type: 'ArrowFunctionExpression', params: paramsNode, body, expression: body.type !== 'BlockStatement', line: startToken.line, col: startToken.col };
	}


	parseAssignmentExpression() {
		let left = this.parseConditionalExpression();
		if (!left) return null;

		if (this.peek().type === 'ASSIGN') {
			const operatorToken = this.consume('ASSIGN');
			const right = this.parseAssignmentExpression();
			if (!right) throw new Error(`Missing right-hand side for assignment at L${operatorToken.line}:C${operatorToken.col}`);
			if (left.type !== 'Identifier' && left.type !== 'MemberExpression') {
				throw new Error(`Invalid left-hand side in assignment expression at L${left.line}:C${left.col}`);
			}
			return {
				type: 'AssignmentExpression',
				operator: operatorToken.value,
				left,
				right,
				line: operatorToken.line, col: operatorToken.col
			};
		}
		return left;
	}

	parseConditionalExpression() {
		let expr = this.parseBinaryExpression(0);
		if (!expr) return null;

		if (this.peek().type === 'QUESTION_MARK') {
			this.consume('QUESTION_MARK');
			const consequent = this.parseAssignmentExpression();
			if (!consequent) throw new Error(`Missing consequent for conditional expression at L${expr.line}:C${expr.col}`);
			this.consume('COLON');
			const alternate = this.parseAssignmentExpression();
			if (!alternate) throw new Error(`Missing alternate for conditional expression at L${expr.line}:C${expr.col}`);
			expr = { type: 'ConditionalExpression', test: expr, consequent, alternate, line: expr.line, col: expr.col };
		}
		return expr;
	}

	getPrecedence(tokenType) {
		switch (tokenType) {
			case 'ASTERISK':
			case 'SLASH':
				return 2;
			case 'PLUS':
			case 'MINUS':
				return 1;
			case 'LT': case 'LTE': case 'GT': case 'GTE':
			case 'EQ': case 'STRICT_EQ': case 'NEQ': case 'STRICT_NEQ':
			case 'INSTANCEOF':
				return 0;
			default:
				return -1;
		}
	}

	parseBinaryExpression(minPrecedence) {
		let left = this.parseUnaryExpression();
		if (!left) return null;

		while (true) {
			const operatorToken = this.peek();
			if (this.isEOF()) break;
			const precedence = this.getPrecedence(operatorToken.type);

			if (precedence < minPrecedence || precedence === -1) {
				break;
			}

			this.consume(operatorToken.type);

			const right = this.parseBinaryExpression(precedence + 1);
			if (!right) throw new Error(`Missing right-hand operand for operator ${operatorToken.value} at L${operatorToken.line}:C${operatorToken.col}`);


			left = {
				type: 'BinaryExpression',
				operator: operatorToken.value,
				left,
				right,
				line: operatorToken.line, col: operatorToken.col
			};
		}
		return left;
	}

	parseUnaryExpression() {
		const token = this.peek();
		if (token.type === 'MINUS' || token.type === 'PLUS' || token.type === 'TYPEOF') {
			const opToken = this.consume();
			const argument = this.parseUnaryExpression();
			if (!argument) throw new Error(`Missing argument for unary operator ${opToken.value} at L${opToken.line}:C${opToken.col}`);
			return { type: 'UnaryExpression', operator: opToken.value, argument, prefix: true, line: opToken.line, col: opToken.col };
		} else if (token.type === 'NEW') {
			return this.parseNewExpression();
		}
		return this.parseMemberOrCallExpression();
	}


	parseNewExpression() {
		const newToken = this.consume('NEW');

		let callee = this.parsePrimaryExpression();
		if (!callee) {
			throw new Error(`Missing callee for new expression at L${newToken.line}:C${newToken.col}. Expected identifier or expression.`);
		}
		if (callee.type === 'EmptyParentheses') {
			throw new Error(`Cannot instantiate empty parentheses '()' with 'new' at L${callee.line}:C${callee.col}.`);
		}

		while (this.peek().type === 'DOT' || this.peek().type === 'LBRACKET') {
			if (this.peek().type === 'DOT') {
				this.consume('DOT');
				const validPropertyTokens = [
					'IDENTIFIER', 'LOG_KW', 'PUTS_KW', 'FUNCTION_KW', 'VAR', 'LET', 'CONST',
					'NEW', 'THIS', 'TYPEOF', 'INSTANCEOF', 'EACH', 'EACH_WITH_INDEX', 'JSON_PROP',
					'DEF', 'END', 'DO', 'WAIT', 'COMPUTE', 'IF', 'ELSE', 'THEN',
					'TRUE', 'FALSE', 'NULL', 'RETURN'
				];
				const propertyToken = this.peek();
				if (!validPropertyTokens.includes(propertyToken.type)) {
					throw new Error(`Unexpected token ${propertyToken.type} ("${propertyToken.value}") as property name in new expression callee at L${propertyToken.line}:C${propertyToken.col}.`);
				}
				this.consume();

				const propertyNode = { type: 'Identifier', name: propertyToken.value, line: propertyToken.line, col: propertyToken.col };
				callee = { type: 'MemberExpression', object: callee, property: propertyNode, computed: false, line: callee.line, col: callee.col };
			} else { // LBRACKET
				this.consume('LBRACKET');
				const property = this.parseExpression();
				if(!property) throw new Error(`Missing property expression for computed member access in new expression callee at L${this.current().line}:C${this.current().col}`);
				this.consume('RBRACKET');
				callee = { type: 'MemberExpression', object: callee, property, computed: true, line: callee.line, col: callee.col };
			}
		}

		let args = [];
		if (this.peek().type === 'LPAREN') {
			this.consume('LPAREN');
			args = this.parseArguments();
			this.consume('RPAREN');
		}

		return { type: 'NewExpression', callee, arguments: args, line: newToken.line, col: newToken.col };
	}

	parseMemberOrCallExpression() {
		let expr = this.parsePrimaryExpression();
		if (!expr) {
			return null;
		}

		if (expr.type === 'EmptyParentheses' && this.peek().type !== 'ARROW' && this.peek().type !== 'LPAREN') {
			throw new Error(`Empty parentheses '()' are not a valid expression here at L${expr.line}:C${expr.col}.`);
		}

		while (true) {
			const token = this.peek();
			if (this.isEOF()) break;

			if (token.type === 'DOT') {
				if (expr.type === 'EmptyParentheses') {
					throw new Error(`Cannot access member of empty parentheses '()' at L${expr.line}:C${expr.col}.`);
				}
				this.consume('DOT');
				const propertyToken = this.consume([
					'IDENTIFIER', 'LOG_KW', 'PUTS_KW', 'FUNCTION_KW', 'VAR', 'LET', 'CONST',
					'NEW', 'THIS', 'TYPEOF', 'INSTANCEOF', 'EACH', 'EACH_WITH_INDEX', 'JSON_PROP',
					'DEF', 'END', 'DO', 'WAIT', 'COMPUTE', 'IF', 'ELSE', 'THEN',
					'TRUE', 'FALSE', 'NULL', 'RETURN'
				]);

				const propertyNode = { type: 'Identifier', name: propertyToken.value, line: propertyToken.line, col: propertyToken.col };
				expr = { type: 'MemberExpression', object: expr, property: propertyNode, computed: false, line: expr.line, col: expr.col };

				if ((propertyToken.value === 'each' || propertyToken.value === 'each_with_index') && this.peek().type === 'DO') {
					this.consume('DO');
					const params = this.parseBlockParams();
					const body = this.parseBlockScoped();
					this.consume('END');
					expr = {
						type: propertyToken.value === 'each' ? 'EachBlock' : 'EachWithIndexBlock',
						object: expr.object,
						params,
						callback: { type: 'FunctionExpression', params, body },
						line: expr.line, col: expr.col
					};
				}

			} else if (token.type === 'LPAREN') {
				if (expr.type === 'EmptyParentheses') {
					throw new Error(`Cannot call an empty parentheses group as a function at L${expr.line}:C${expr.col}`);
				}
				this.consume('LPAREN');
				const args = this.parseArguments();
				this.consume('RPAREN');
				expr = { type: 'CallExpression', callee: expr, arguments: args, line: expr.line, col: expr.col };

				if (this.peek().type === 'DO') {
					this.consume('DO');
					const params = this.parseBlockParams();
					const body = this.parseBlockScoped();
					this.consume('END');
					expr.callback = { type: 'FunctionExpression', params, body };
				}
			} else if (token.type === 'LBRACKET') {
				if (expr.type === 'EmptyParentheses') {
					throw new Error(`Cannot access member of empty parentheses '()' with brackets at L${expr.line}:C${expr.col}.`);
				}
				this.consume('LBRACKET');
				const property = this.parseExpression();
				if(!property) throw new Error(`Missing property expression for computed member access at L${token.line}:C${token.col}`);
				this.consume('RBRACKET');
				expr = { type: 'MemberExpression', object: expr, property, computed: true, line: expr.line, col: expr.col };
			} else {
				break;
			}
		}
		return expr;
	}

	parseArguments() {
		const args = [];
		if (this.peek().type !== 'RPAREN') {
			do {
				if (this.peek().type === 'RPAREN') break;
				const argExpr = this.parseExpression();
				if (argExpr) {
					args.push(argExpr);
				} else {
					if (this.peek().type !== 'RPAREN' && this.peek().type !== 'COMMA' && !this.isEOF()) {
						throw new Error(`Expected expression, comma, or RPAREN in argument list, got ${this.peek().type} at L${this.peek().line}:C${this.peek().col}`);
					}
					break;
				}

				if (this.peek().type === 'COMMA') {
					this.consume('COMMA');
					if (this.peek().type === 'RPAREN') {
						break;
					}
				} else {
					break;
				}
			} while (this.peek().type !== 'RPAREN' && !this.isEOF());
		}
		return args;
	}

	parsePrimaryExpression() {
		const token = this.peek();
		if (this.isEOF()) return null;

		switch (token.type) {
			case 'THIS':
				this.consume(); return { type: 'ThisExpression', line: token.line, col: token.col };
			case 'IDENTIFIER':
				this.consume(); return { type: 'Identifier', name: token.value, line: token.line, col: token.col };
			case 'NUMBER': this.consume(); return { type: 'Literal', value: token.value, raw: String(token.value), line: token.line, col: token.col };
			case 'STRING':
				const strToken = this.consume();
				let rawString;
				if (strToken.value.includes('${') && strToken.value.includes('}')) {
					rawString = `\`${strToken.value.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\``;
				} else {
					rawString = JSON.stringify(strToken.value);
				}
				return { type: 'Literal', value: strToken.value, raw: rawString, line: strToken.line, col: strToken.col };
			case 'SYMBOL': this.consume(); return { type: 'SymbolLiteral', value: token.value, line: token.line, col: token.col };
			case 'TRUE':
			case 'FALSE':
				this.consume(); return { type: 'Literal', value: token.value === 'true', raw: token.value, line: token.line, col: token.col };
			case 'NULL':
				this.consume(); return { type: 'Literal', value: null, raw: 'null', line: token.line, col: token.col };
			case 'LPAREN':
				const lparenToken = this.consume('LPAREN');
				if (this.peek().type === 'RPAREN') {
					this.consume('RPAREN');
					return { type: 'EmptyParentheses', line: lparenToken.line, col: lparenToken.col };
				}
				const expr = this.parseExpression();
				if (!expr) {
					throw new Error(`Invalid or empty expression inside parentheses, starting at L${lparenToken.line}:C${lparenToken.col}. Found ${this.peek().type} before RPAREN.`);
				}
				this.consume('RPAREN');
				return expr;
			case 'LBRACE': return this.parseHashOrObjectLiteral();
			case 'LBRACKET': return this.parseArrayLiteral();
			case 'FUNCTION_KW':
				return this.parseFunctionExpressionNode();
			case 'RPAREN':
				return null;
			default:
				throw new Error(`Unexpected token in primary expression: ${token.type} ("${token.value}") at L${token.line}:C${token.col}.`);
		}
	}

	parseFunctionExpressionNode() {
		const funcToken = this.consume('FUNCTION_KW');
		let id = null;
		if (this.peek().type === 'IDENTIFIER') {
			id = this.consume('IDENTIFIER');
		}
		const params = this.parseParameters(false);
		const body = this.parseBlockStatementNode(true);
		return { type: 'FunctionExpression', id, params, body, line: funcToken.line, col: funcToken.col };
	}

	parseVariableDeclaration() {
		const kindToken = this.consume();
		const declarations = [];
		do {
			const idToken = this.consume('IDENTIFIER');
			const idNode = { type: 'Identifier', name: idToken.value, line: idToken.line, col: idToken.col };
			let init = null;
			if (this.peek().type === 'ASSIGN') {
				this.consume('ASSIGN');
				init = this.parseAssignmentExpression();
				if (!init) throw new Error(`Missing initializer after '=' in variable declaration for '${idNode.name}' at L${idToken.line}:C${idToken.col}`);
			}
			declarations.push({ type: 'VariableDeclarator', id: idNode, init });
			if (this.peek().type === 'COMMA') {
				this.consume('COMMA');
				if (this.peek().type === 'SEMICOLON' || this.isEOF() || this.peek().line > idToken.line) break;
			} else {
				break;
			}
		} while(true);
		if(this.peek().type === 'SEMICOLON') this.consume('SEMICOLON');
		return { type: 'VariableDeclaration', declarations, kind: kindToken.value, line: kindToken.line, col: kindToken.col };
	}

	parseHashOrObjectLiteral() {
		const token = this.consume('LBRACE');
		const properties = [];
		while(this.peek().type !== 'RBRACE' && !this.isEOF()) {
			let key;
			const keyToken = this.peek();
			const validKeyTypesAsIdentifiers = [
				'IDENTIFIER', 'LOG_KW', 'PUTS_KW', 'FUNCTION_KW', 'VAR', 'LET', 'CONST',
				'NEW', 'THIS', 'TYPEOF', 'INSTANCEOF',
				'DEF', 'END', 'DO', 'WAIT', 'COMPUTE', 'IF', 'ELSE', 'THEN',
				'TRUE', 'FALSE', 'NULL', 'RETURN'
			];

			if (validKeyTypesAsIdentifiers.includes(keyToken.type) ) {
				const consumedKey = this.consume(keyToken.type);
				key = { type: 'Identifier', name: consumedKey.value, line:consumedKey.line, col:consumedKey.col };
			} else if (keyToken.type === 'SYMBOL') {
				this.consume('SYMBOL');
				key = { type: 'Literal', value: keyToken.value, raw: `"${keyToken.value}"`, line:keyToken.line, col:keyToken.col };
			} else if (keyToken.type === 'STRING') {
				this.consume('STRING');
				key = { type: 'Literal', value: keyToken.value, raw: JSON.stringify(keyToken.value), line:keyToken.line, col:keyToken.col };
			} else if (keyToken.type === 'NUMBER') {
				this.consume('NUMBER');
				key = { type: 'Literal', value: keyToken.value, raw: String(keyToken.value), line:keyToken.line, col:keyToken.col };
			}
			else {
				throw new Error(`Invalid key in hash/object literal: ${keyToken.type} ("${keyToken.value}") at L${keyToken.line}:C${keyToken.col}`);
			}

			this.consume('COLON');
			const value = this.parseExpression();
			if (!value) throw new Error(`Missing value for key '${key.value || key.name}' in object literal at L${keyToken.line}:C${keyToken.col}`);
			properties.push({ type: 'Property', key, value, computed: false, line: keyToken.line, col: keyToken.col });

			if (this.peek().type === 'COMMA') {
				this.consume('COMMA');
				if (this.peek().type === 'RBRACE') break;
			} else if (this.peek().type !== 'RBRACE') {
				throw new Error(`Expected comma or } in hash/object literal, got ${this.peek().type} at L${this.peek().line}:C${this.peek().col}`);
			}
		}
		if (this.peek().type === 'RBRACE') this.consume('RBRACE');
		else throw new Error(`Unterminated object literal, expected RBRACE at L${token.line}:C${token.col}`);
		return { type: 'ObjectExpression', properties, line: token.line, col: token.col };
	}

	parseArrayLiteral() {
		const arrToken = this.consume('LBRACKET');
		const elements = [];

		if (this.peek().type !== 'RBRACKET') {
			while (!this.isEOF()) {
				if (this.peek().type === 'RBRACKET') break;

				if (this.peek().type === 'COMMA') {
					if (elements.length === 0 || (this.tokens[this.pos-1] && this.tokens[this.pos-1].type === 'COMMA')) {
						elements.push(null);
					}
					this.consume('COMMA');
					if (this.peek().type === 'RBRACKET') break;
					continue;
				}

				const el = this.parseExpression();
				if (el) {
					elements.push(el);
				} else {
					if (this.peek().type !== 'RBRACKET' && this.peek().type !== 'COMMA') {
						throw new Error(`Invalid element in array literal near L${this.current().line}:C${this.current().col}, got ${this.current().type}`);
					}
				}

				if (this.peek().type === 'RBRACKET') {
					break;
				}
				if (this.peek().type !== 'RBRACKET') {
					this.consume('COMMA');
				}


				if (this.peek().type === 'RBRACKET') break;
			}
		}
		this.consume('RBRACKET');
		return { type: 'ArrayExpression', elements, line: arrToken.line, col: arrToken.col };
	}
}


// ===== Generator (Avec corrections pour `this` et gestion de portée) =====
class Generator {
	constructor() {
		this.indentationLevel = 0;
		this.output = "";
		this.needsSemicolon = true;
		this.declaredVariables = new Set();
		this.isTopLevel = true;
	}

	indent() { return '  '.repeat(this.indentationLevel); }

	append(str, noIndent = false) {
		if (this.output.endsWith('\n') && !noIndent && str.trim() !== "") {
			this.output += this.indent();
		}
		this.output += str;
	}

	newline() {
		if (!this.output.endsWith('\n\n') && !this.output.endsWith('\n')) {
			this.output += '\n';
		} else if (this.output.endsWith('\n\n') && this.output.length > 2) {
			// No double empty lines
		}
	}

	addParamsToDeclaredVariables(paramsNodes) {
		if (paramsNodes) {
			paramsNodes.forEach(pNode => {
				if (pNode.name) {
					this.declaredVariables.add(pNode.name);
				}
			});
		}
	}

	generateProgram(node) {
		this.output = "";
		this.declaredVariables.clear();
		this.isTopLevel = true;

		node.body.forEach(n => { // Arrow function pour conserver `this`
			if (!n) return;

			const originalIsTopLevelForThisNode = this.isTopLevel;

			if (n.type === 'FunctionDefinition' ||
				n.type === 'JavaScriptFunctionDefinition' ||
				n.type === 'FunctionExpression' ||
				n.type === 'ArrowFunctionExpression') {
				this.isTopLevel = false; // Le contenu de la fonction n'est pas top-level
			}

			this.generateNode(n);

			this.isTopLevel = originalIsTopLevelForThisNode; // Restaurer pour le prochain nœud du corps du programme

			if (this.needsSemicolon &&
				n.type !== 'FunctionDefinition' && n.type !== 'JavaScriptFunctionDefinition' &&
				n.type !== 'IfStatement' &&
				!this.output.trim().endsWith(';') &&
				!this.output.trim().endsWith('}') &&
				!this.output.trim().endsWith('{')) {
				this.append(';');
			}
			this.newline();
			this.needsSemicolon = true;
		});
		return this.output.trim() + '\n';
	}

	generateNode(node) {
		if (!node) return;
		if (node.type === 'EmptyParentheses') {
			this.append('()');
			this.needsSemicolon = true;
			return;
		}
		if (node.type === 'Parameter') {
			if (node.isRest) this.append('...');
			if (node.isObjectPattern) this.append(`{ ${node.name} }`);
			else this.append(node.name);
			this.needsSemicolon = false;
			return;
		}
		if (node.type === 'ThisExpression') {
			this.append('this');
			this.needsSemicolon = true;
			return;
		}
		const generatorMethod = `generate${node.type}`;
		if (this[generatorMethod]) {
			this[generatorMethod](node);
		} else {
			console.warn(`Unknown AST node type for generation: ${node.type}`, node);
			this.append(`/* UNKNOWN NODE: ${node.type} */`);
			this.needsSemicolon = true;
		}
	}

	generateExpressionStatement(node) {
		if (node.expression) this.generateNode(node.expression);
		this.needsSemicolon = true;
	}

	generateJavaScriptBlock(node) {
		let jsCode = node.code;
		jsCode = jsCode.replace(/(?<![\w$.])\:([a-zA-Z_]\w*)/g, '"$1"');
		jsCode = jsCode.replace(/^\s*\b(log|puts)\s+(.+?)(;)?$/gm, (match, _, expr) => `console.log(${expr.trim()});`);
		jsCode = jsCode.replace(/\bputs\(([^)]+)\)/g, "console.log($1)");
		jsCode = jsCode.replace(/(["'])((?:(?<!\\)\\[\s\S]|[^#\1\\])*?)\#\{((?:(?<!\\)\\[\s\S]|[^}\\])*?)\}(.*?)\1/g, (match, quote, before, _ignoreBeforeEscape, expr, after) => {
			let result = "";
			if (before) result += `${quote}${before}${quote} + `;
			else result += (quote === '`' ? '' : `"" + `);
			result += `(${expr.trim()})`;
			if (after) result += ` + ${quote}${after}${quote}`;
			else result += (quote === '`' ? '' : ` + ""`);
			return result;
		});
		this.append(jsCode);
		this.needsSemicolon = !jsCode.trim().endsWith(';') && !jsCode.trim().endsWith('}');
	}

	generateBlockStatement(node, isFunctionBody = false) {
		const parentDeclaredVariables = new Set(this.declaredVariables);
		const parentIsTopLevel = this.isTopLevel;

		if (isFunctionBody) {
			this.isTopLevel = false;
			// Les paramètres sont déjà ajoutés par la fonction appelante (generateFunctionDefinition, etc.)
		}

		this.append('{');
		this.newline();
		this.indentationLevel++;

		node.body.forEach(stmt => { // Arrow function
			if (!stmt) return;
			const originalIsTopLevelForStmt = this.isTopLevel;
			if (stmt.type === 'FunctionDefinition' || stmt.type === 'JavaScriptFunctionDefinition') {
				this.isTopLevel = false;
			}
			this.generateNode(stmt);
			this.isTopLevel = originalIsTopLevelForStmt;

			if (this.needsSemicolon && stmt.type !== 'FunctionDefinition' && stmt.type !== 'JavaScriptFunctionDefinition' &&
				stmt.type !== 'IfStatement' && stmt.type !== 'BlockStatement' &&
				!this.output.trim().endsWith(';') && !this.output.trim().endsWith('}') && !this.output.trim().endsWith('{') ) {
				this.append(';');
			}
			this.newline();
			this.needsSemicolon = true;
		});

		this.indentationLevel--;
		this.append('}');
		this.needsSemicolon = false;
		this.declaredVariables = parentDeclaredVariables;
		this.isTopLevel = parentIsTopLevel;
	}

	generateFunctionDefinition(node) {
		const parentDeclaredVariables = new Set(this.declaredVariables);
		const parentIsTopLevel = this.isTopLevel;
		this.isTopLevel = false;
		this.declaredVariables.clear();
		this.addParamsToDeclaredVariables(node.params);

		this.append(`function ${node.id.value}(`);
		node.params.forEach((p, index) => {
			this.generateNode(p);
			if (index < node.params.length - 1) this.append(', ');
		});
		this.append(') ');
		this.generateBlockStatement(node.body, true); // true pour isFunctionBody

		const bodyStmts = node.body.body;
		if (bodyStmts.length > 0) {
			const lastStmt = bodyStmts[bodyStmts.length - 1];
			let lastLineGenerated = "";
			const tempGen = new Generator(); // Générateur temporaire pour ne pas affecter l'état
			if (lastStmt) tempGen.generateNode(lastStmt);
			lastLineGenerated = tempGen.output.trim();

			if (lastStmt && lastStmt.type !== 'ReturnStatement' && !lastLineGenerated.startsWith('return ') && !lastLineGenerated.startsWith('console.log') && lastLineGenerated && lastStmt.type !== 'IfStatement') {
				const currentOutputEndsWithRBraceNewline = this.output.match(/}\s*\n$/);
				if (currentOutputEndsWithRBraceNewline) {
					this.output = this.output.substring(0, currentOutputEndsWithRBraceNewline.index + 1); // Avant le dernier }
				} else if (this.output.endsWith('}')) {
					this.output = this.output.slice(0, -1);
				}
				if (!this.output.endsWith('\n')) this.newline();
				this.append(`  return ${lastLineGenerated.replace(/;$/, '')};`);
				this.newline();
				this.append('}'); // Refermer le bloc
			}
		}
		this.declaredVariables = parentDeclaredVariables;
		this.isTopLevel = parentIsTopLevel;
		this.needsSemicolon = false;
	}

	generateJavaScriptFunctionDefinition(node) {
		const parentDeclaredVariables = new Set(this.declaredVariables);
		const parentIsTopLevel = this.isTopLevel;
		this.isTopLevel = false;
		this.declaredVariables.clear();
		this.addParamsToDeclaredVariables(node.params);

		this.append(`function `);
		if (node.id) this.generateNode(node.id);
		this.append('(');
		node.params.forEach((p, index) => {
			this.generateNode(p);
			if (index < node.params.length - 1) this.append(', ');
		});
		this.append(') ');
		this.generateBlockStatement(node.body, true);

		this.declaredVariables = parentDeclaredVariables;
		this.isTopLevel = parentIsTopLevel;
		this.needsSemicolon = false;
	}

	generateFunctionExpression(node) {
		const parentDeclaredVariables = new Set(this.declaredVariables);
		const parentIsTopLevel = this.isTopLevel;
		this.isTopLevel = false;
		this.declaredVariables.clear();
		this.addParamsToDeclaredVariables(node.params);

		this.append(`function`);
		if (node.id) {
			this.append(` `);
			this.generateNode(node.id);
		}
		this.append('(');
		node.params.forEach((p, index) => {
			this.generateNode(p);
			if (index < node.params.length - 1) this.append(', ');
		});
		this.append(') ');
		this.generateBlockStatement(node.body, true);

		this.declaredVariables = parentDeclaredVariables;
		this.isTopLevel = parentIsTopLevel;
		this.needsSemicolon = true;
	}

	generateArrowFunctionExpression(node) {
		const parentDeclaredVariables = new Set(this.declaredVariables);
		const parentIsTopLevel = this.isTopLevel;
		this.isTopLevel = false;
		this.declaredVariables.clear();
		this.addParamsToDeclaredVariables(node.params);

		const isSingleSimpleParam = node.params.length === 1 &&
			node.params[0].type === 'Parameter' &&
			!node.params[0].isObjectPattern &&
			!node.params[0].isRest;

		if (isSingleSimpleParam) {
			this.generateNode(node.params[0]);
		} else {
			this.append('(');
			node.params.forEach((p, i) => {
				this.generateNode(p);
				if (i < node.params.length - 1) this.append(', ');
			});
			this.append(')');
		}
		this.append(' => ');
		if (node.body.type === 'BlockStatement') {
			this.generateBlockStatement(node.body, true);
		} else {
			if (node.body.type === 'ObjectExpression') {
				this.append('(');
				this.generateNode(node.body);
				this.append(')');
			} else {
				this.generateNode(node.body);
			}
		}
		this.declaredVariables = parentDeclaredVariables;
		this.isTopLevel = parentIsTopLevel;
		this.needsSemicolon = true;
	}

	generateIfStatement(node) {
		this.append('if (');
		this.generateNode(node.test);
		this.append(') ');
		this.generateNode(node.consequent); // consequent est déjà un BlockStatement
		if (node.alternate) {
			if (!this.output.trim().endsWith('}')) this.append(' ');
			this.append('else ');
			this.generateNode(node.alternate); // alternate est un BlockStatement ou IfStatement
		}
		this.needsSemicolon = false;
	}

	generateReturnStatement(node) {
		this.append('return');
		if (node.argument) {
			this.append(' ');
			this.generateNode(node.argument);
		}
		this.needsSemicolon = true;
	}

	generateWaitBlock(node) {
		this.append(`setTimeout(function(`);
		node.callback.params.forEach((p, i) => {
			this.generateNode(p);
			if (i < node.callback.params.length - 1) this.append(', ');
		});
		this.append(`) `);
		// Le corps du callback est une fonction, donc isFunctionBody=true
		this.generateBlockStatement(node.callback.body, true);
		this.append(`, ${node.duration.value})`);
		this.needsSemicolon = true;
	}

	generateComputeBlock(node) {
		this.append(`compute(${node.arg1.value}, ${node.arg2.value}, function(`);
		node.callback.params.forEach((p, i) => {
			this.generateNode(p);
			if (i < node.callback.params.length - 1) this.append(', ');
		});
		this.append(`) `);
		this.generateBlockStatement(node.callback.body, true);
		this.append(`)`);
		this.needsSemicolon = true;
	}

	generateLogStatement(node) {
		this.append(`console.log(`);
		this.generateNode(node.argument);
		this.append(`)`);
		this.needsSemicolon = true;
	}

	generateEachBlock(node) {
		this.generateNode(node.object);
		this.append(`.forEach(function(`);
		node.params.forEach((p, i) => {
			this.generateNode(p);
			if (i < node.params.length - 1) this.append(', ');
		});
		this.append(`) `);
		this.generateBlockStatement(node.callback.body, true);
		this.append(`)`);
		this.needsSemicolon = true;
	}

	generateEachWithIndexBlock(node) {
		const objectStr = this.generateNodeForExpression(node.object);
		if (objectStr === 'args' && node.params.length === 2) {
			this.append(`Object.entries(args).forEach(function([${node.params[1].name}, ${node.params[0].name}]) `);
		} else {
			this.append(objectStr);
			this.append(`.forEach(function(`);
			const paramsToGen = [...node.params];
			if (node.params.length === 1) {
				paramsToGen.push({type: 'Parameter', name: 'index'});
			} else if (node.params.length === 0) {
				paramsToGen.push({type: 'Parameter', name: 'item'});
				paramsToGen.push({type: 'Parameter', name: 'index'});
			}
			paramsToGen.forEach((p, i) => {
				this.generateNode(p);
				if (i < paramsToGen.length - 1) this.append(', ');
			});
			this.append(`) `);
		}
		this.generateBlockStatement(node.callback.body, true);
		this.append(`)`);
		this.needsSemicolon = true;
	}

	generateNodeForExpression(node) {
		const oldOutput = this.output;
		const oldIndent = this.indentationLevel;
		const oldNeedsSemicolon = this.needsSemicolon;
		const oldDeclaredVars = new Set(this.declaredVariables);
		const oldIsTopLevel = this.isTopLevel;

		this.output = "";
		this.indentationLevel = 0; // Pas d'indentation pour une expression isolée
		this.needsSemicolon = false; // Une expression n'a pas de point-virgule en elle-même
		// isTopLevel et declaredVariables ne devraient pas être modifiés pour une simple expression

		this.generateNode(node);
		const exprStr = this.output;

		this.output = oldOutput;
		this.indentationLevel = oldIndent;
		this.needsSemicolon = oldNeedsSemicolon;
		this.declaredVariables = oldDeclaredVars;
		this.isTopLevel = oldIsTopLevel;
		return exprStr.trim();
	}

	generateCallExpression(node) {
		this.generateNode(node.callee);
		this.append(`(`);
		node.arguments.forEach((arg, i) => {
			this.generateNode(arg);
			if (i < node.arguments.length - 1) this.append(', ');
		});
		if (node.callback) { // Pour les callbacks `do ... end` après un appel
			if (node.arguments.length > 0) this.append(', ');
			this.append(`function(`);
			node.callback.params.forEach((p, i) => {
				this.generateNode(p);
				if (i < node.callback.params.length - 1) this.append(', ');
			});
			this.append(`) `);
			this.generateBlockStatement(node.callback.body, true); // C'est un corps de fonction
		}
		this.append(`)`);
		this.needsSemicolon = true;
	}

	generateMemberExpression(node) {
		if (node.property.type === 'Identifier' && node.property.name === 'json' && !node.computed) {
			this.append(`JSON.stringify(`);
			this.generateNode(node.object);
			this.append(`)`);
			return;
		}
		this.generateNode(node.object);
		if (node.computed) {
			this.append(`[`);
			this.generateNode(node.property);
			this.append(`]`);
		} else {
			this.append(`.`);
			this.generateNode(node.property);
		}
		this.needsSemicolon = true;
	}

	generateNewExpression(node) {
		this.append('new ');
		this.generateNode(node.callee);
		this.append('(');
		node.arguments.forEach((arg, i) => {
			this.generateNode(arg);
			if (i < node.arguments.length - 1) this.append(', ');
		});
		this.append(')');
		this.needsSemicolon = true;
	}

	generateIdentifier(node) { this.append(node.name); this.needsSemicolon = true;}
	generateLiteral(node) {
		if (node.raw !== undefined) {
			this.append(node.raw);
		} else {
			if (typeof node.value === 'string') {
				this.append(JSON.stringify(node.value));
			} else {
				this.append(String(node.value));
			}
		}
		this.needsSemicolon = true;
	}
	generateSymbolLiteral(node) { this.append(`"${node.value}"`); this.needsSemicolon = true;}

	generateObjectExpression(node) {
		if (node.properties.length === 0) {
			this.append('{}');
			this.needsSemicolon = true;
			return;
		}
		this.append('{');
		this.newline();
		this.indentationLevel++;
		node.properties.forEach((prop, i) => {
			if (prop.key.type === 'Identifier' && /^[a-zA-Z_$][\w$]*$/.test(prop.key.name)) {
				this.append(prop.key.name);
			} else {
				this.generateNode(prop.key);
			}
			this.append(': ');
			this.generateNode(prop.value);
			if (i < node.properties.length - 1) this.append(',');
			this.newline();
		});
		this.indentationLevel--;
		this.append('}');
		this.needsSemicolon = true;
	}

	generateArrayExpression(node) {
		this.append('[');
		node.elements.forEach((el, i) => {
			if (el === null) {
				// Laisse vide pour l'elision, la virgule est gérée par la boucle
			} else {
				this.generateNode(el);
			}
			if (i < node.elements.length - 1) {
				this.append(', ');
			}
		});
		this.append(']');
		this.needsSemicolon = true;
	}

	generateAssignmentExpression(node) {
		if (this.isTopLevel && node.left.type === 'Identifier' && !this.declaredVariables.has(node.left.name)) {
			this.append(`var `); // Déclaration implicite var pour les globales non déclarées
			this.declaredVariables.add(node.left.name);
		}
		this.generateNode(node.left);
		this.append(` ${node.operator} `);
		this.generateNode(node.right);
		this.needsSemicolon = true;
	}

	generateVariableDeclaration(node) {
		this.append(`${node.kind} `);
		node.declarations.forEach((decl, i) => {
			if (decl.id.type === 'Identifier') {
				this.declaredVariables.add(decl.id.name); // Enregistrer les variables déclarées explicitement
			}
			this.generateNode(decl.id);
			if (decl.init) {
				this.append(' = ');
				this.generateNode(decl.init);
			}
			if (i < node.declarations.length - 1) this.append(', ');
		});
		this.needsSemicolon = true; // La déclaration elle-même est un statement
	}

	generateBinaryExpression(node) {
		const op = node.operator;
		const leftIsBinary = node.left.type === 'BinaryExpression';
		const rightIsBinary = node.right.type === 'BinaryExpression';
		const currentPrec = this.getPrecedence(op);
		const leftPrec = leftIsBinary && node.left.operator ? this.getPrecedence(node.left.operator) : Infinity;
		const rightPrec = rightIsBinary && node.right.operator ? this.getPrecedence(node.right.operator) : Infinity;
		const needsParensLeft = (leftIsBinary && leftPrec < currentPrec) ||
			(leftIsBinary && leftPrec === currentPrec && op === node.left.operator && (op === '-' || op === '/')) ||
			node.left.type === 'ConditionalExpression' || node.left.type === 'AssignmentExpression';
		const needsParensRight = (rightIsBinary && rightPrec < currentPrec) ||
			(rightIsBinary && rightPrec === currentPrec && !(['+', '*', '==', '===', '!=', '!==', '<', '<=', '>', '>='].includes(op) && op === node.right.operator) ) ||
			node.right.type === 'ConditionalExpression' || node.right.type === 'AssignmentExpression';

		if(needsParensLeft) this.append('(');
		this.generateNode(node.left);
		if(needsParensLeft) this.append(')');
		this.append(` ${op} `);
		if(needsParensRight) this.append('(');
		this.generateNode(node.right);
		if(needsParensRight) this.append(')');
		this.needsSemicolon = true;
	}

	generateConditionalExpression(node) {
		const needsParensTest = node.test.type === 'BinaryExpression' || node.test.type === 'ConditionalExpression' || node.test.type === 'AssignmentExpression';
		if(needsParensTest) this.append('(');
		this.generateNode(node.test);
		if(needsParensTest) this.append(')');
		this.append(' ? ');
		const needsParensConsequent = node.consequent.type === 'AssignmentExpression';
		if(needsParensConsequent) this.append('(');
		this.generateNode(node.consequent);
		if(needsParensConsequent) this.append(')');
		this.append(' : ');
		this.generateNode(node.alternate);
		this.needsSemicolon = true;
	}

	generateUnaryExpression(node) {
		this.append(node.operator);
		if (node.operator.length > 1 && node.operator.match(/[a-zA-Z]$/)) {
			this.append(' ');
		}
		if (node.argument.type === 'BinaryExpression' || node.argument.type === 'ConditionalExpression' || node.argument.type === 'AssignmentExpression' ||
			(node.argument.type === 'UnaryExpression' && this.getPrecedence(node.operator) > this.getPrecedence(node.argument.operator) ) ) {
			this.append('(');
			this.generateNode(node.argument);
			this.append(')');
		} else {
			this.generateNode(node.argument);
		}
		this.needsSemicolon = true;
	}

	getPrecedence(operatorValue) {
		switch (operatorValue) {
			case '*': case '/': return 4;
			case '+': case '-': return 3;
			case '<': case '<=': case '>': case '>=': case 'instanceof': return 2;
			case '==': case '===': case '!=': case '!==': return 1;
			default: return -1;
		}
	}
}


// ===== Fonction Principale `runSquirrel` =====
function runSquirrel(code) {
	console.log("Original Squirrel/JS code:");
	console.log("--------------------------");
	console.log(code);
	console.log("--------------------------\n");

	try {
		const lexer = new Lexer(code);
		const tokens = lexer.tokenize();
		console.log('==== TOKEN STREAM DUMP ====');
		tokens.forEach(tok => {
			console.log(JSON.stringify({type: tok.type, value: String(tok.value).substring(0, 70), line: tok.line, col: tok.col}));
		});
		console.log('==== END TOKEN STREAM DUMP ====');


		const parser = new Parser(tokens);
		const ast = parser.parse();
		// console.log("AST:", JSON.stringify(ast, null, 2));

		const generator = new Generator();
		const jsCode = generator.generateProgram(ast);

		console.log("Generated JavaScript:");
		console.log("---------------------");
		console.log(jsCode);
		console.log("---------------------\n");

		console.log("Executing generated JavaScript...\n");
		const execFunc = new Function('compute', 'grab', 'A', jsCode);

		function compute_runtime(a, b, callback) {
			const sum = a + b;
			callback(sum);
		}
		function grab_runtime(id) {
			if (typeof document !== 'undefined' && document.getElementById(id) && document.getElementById(id)._A_instance) {
				return document.getElementById(id)._A_instance;
			} else if (typeof document !== 'undefined') {
				return document.getElementById(id);
			}
			return null;
		}
		const classA_runtime = typeof A !== 'undefined' ? A : function(options) {
			this.options = options || {};
			this.id = this.options.id;
			this._fastened = this.options.fasten ? [...this.options.fasten] : [];
			this.element = {
				style: {},
				dataset: {},
				appendChild: function(child) { return child;},
				addEventListener: function(type, listener) { },
			};
			if(this.options.markup && this.id && typeof document !== 'undefined') {
				const el = document.createElement(this.options.markup);
				el.id = this.id;
				if(this.options.attach === 'body') document.body.appendChild(el);
				else if (this.options.attach && typeof this.options.attach === 'string' && this.options.attach.startsWith('#')) {
					const parent = document.getElementById(this.options.attach.substring(1));
					if(parent) parent.appendChild(el);
				}
				this.element = el;
				if (el && typeof el._A_instance === 'undefined') el._A_instance = this;
			}

			this.width = function(val) {
				if(val !== undefined) {
					this.options.width = val;
					if(this.element && this.element.style) this.element.style.width = typeof val === 'number' ? val + 'px' : val;
				}
				return this.options.width;
			};
			this.height = function(val) {
				if(val !== undefined) {
					this.options.height = val;
					if(this.element && this.element.style) this.element.style.height = typeof val === 'number' ? val + 'px' : val;
				}
				return this.options.height;
			};
			this.style = new Proxy(this.element.style || {}, {
				set: (target, property, value) => {
					if (this.element && this.element.style) {
						this.element.style[property] = value;
					}
					target[property] = value;
					return true;
				},
				get: (target, property) => {
					return this.element && this.element.style ? this.element.style[property] : target[property];
				}
			});
			this.addChild = function(childOptions) {
				const childId = childOptions.id;
				if (childId) this._fastened.push(childId);
				const attachToId = this.id ? `#${this.id}` : (this.options.attach || 'body');
				return new classA_runtime({...childOptions, attach: attachToId });
			};
			this.getFastened = function() { return this._fastened; };

			if (this.element && this.element.style) {
				for (const key in this.options) {
					if (Object.prototype.hasOwnProperty.call(this.options, key)) {
						if (['x', 'y', 'width', 'height', 'color', 'backgroundColor', 'display', 'overflow', 'textAlign', 'lineHeight', 'fontWeight', 'fontSize', 'cursor', 'padding', 'margin', 'borderRadius', 'transition', 'position', 'boxShadow', 'opacity', 'zIndex'].includes(key)) {
							let cssKey = key;
							if (key === 'x') cssKey = 'left';
							if (key === 'y') cssKey = 'top';
							let cssValue = this.options[key];
							if (typeof cssValue === 'number' && (cssKey === 'left' || cssKey === 'top' || cssKey === 'width' || cssKey === 'height' || cssKey === 'fontSize' || cssKey === 'lineHeight' || cssKey === 'padding' || cssKey === 'margin' || cssKey === 'borderRadius')) {
								cssValue += 'px';
							}
							this.element.style[cssKey] = cssValue;
						}
						if (key === 'text' && this.options.text) {
							this.element.textContent = this.options.text;
						}
						if (key === 'events' && typeof this.options.events === 'object') {
							for (const eventType in this.options.events) {
								if (Object.prototype.hasOwnProperty.call(this.options.events, eventType)) {
									this.element.addEventListener(eventType, this.options.events[eventType]);
								}
							}
						}
					}
				}
			}
		};
		if (typeof A === 'undefined' && typeof window !== 'undefined') {
			window.A = classA_runtime;
			A.getById = function(id) {
				const element = document.getElementById(id);
				if (element && element._A_instance) return element._A_instance;
				return { element: element, _fastened: [], addChild: function() {}, getFastened: function() {return []}, style: (element ? element.style : {}) };
			}
		} else if (typeof A === 'undefined' && typeof global !== 'undefined') {
			global.A = classA_runtime;
			A.getById = function(id) { return { element: null, style: {} }; }
		}

		return execFunc(compute_runtime, grab_runtime, typeof A !== 'undefined' ? A : classA_runtime);

	} catch (error) {
		console.error("❌ Error during Squirrel processing:", error.message);
		if (error.stack) {
			console.error("Stacktrace:", error.stack);
		}
		if (typeof document !== 'undefined' && document.body) {
			const errDiv = document.createElement('div');
			errDiv.style.color = 'red';
			errDiv.style.whiteSpace = 'pre-wrap';
			errDiv.textContent = "Error: " + error.message + "\n\nStack:\n" + error.stack;
			document.body.prepend(errDiv);
		}
		return null;
	}
}

// ===== Export (TRÈS IMPORTANT) =====
if (typeof window !== 'undefined') {
	window.runSquirrel = runSquirrel;
} else if (typeof global !== 'undefined') {
	global.runSquirrel = runSquirrel;
}