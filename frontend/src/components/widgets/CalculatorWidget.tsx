import React, { useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import type { WidgetSize } from '../../store/layoutStore';
import { useTranslation } from '../../i18n/useTranslation';

// ── Safe expression evaluator (zero deps) ─────────────────────────────

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

const FUNCTIONS: Record<string, (x: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  log10: Math.log10,
  log: Math.log,
  ln: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  factorial: (n: number) => {
    if (n < 0 || !Number.isInteger(n)) return NaN;
    if (n > 170) return Infinity;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  },
};

type Token =
  | { type: 'number'; value: number }
  | { type: 'op'; value: string }
  | { type: 'lparen'; value: '(' }
  | { type: 'rparen'; value: ')' }
  | { type: 'func'; value: string }
  | { type: 'const'; value: string };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = expr.replace(/\s+/g, '');
  while (i < s.length) {
    const ch = s[i];
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < s.length && /[0-9.]/.test(s[i])) num += s[i++];
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let word = '';
      while (i < s.length && /[a-zA-Z0-9_]/.test(s[i])) word += s[i++];
      const lower = word.toLowerCase();
      if (FUNCTIONS[lower]) tokens.push({ type: 'func', value: lower });
      else if (CONSTANTS[lower] !== undefined) tokens.push({ type: 'const', value: lower });
      else throw new Error(`Unknown: ${word}`);
      continue;
    }
    if (ch === '(') { tokens.push({ type: 'lparen', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ')' }); i++; continue; }
    if ('+-*/^%'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
    throw new Error(`Unexpected: ${ch}`);
  }
  return tokens;
}

function evaluateTokens(tokens: Token[]): number {
  let pos = 0;
  function peek(): Token | undefined { return tokens[pos]; }
  function next(): Token { return tokens[pos++]; }

  function parseExpr(): number {
    let left = parseTerm();
    while (peek()?.type === 'op' && (peek()!.value === '+' || peek()!.value === '-')) {
      const op = (next() as { type: 'op'; value: string }).value;
      left = op === '+' ? left + parseTerm() : left - parseTerm();
    }
    return left;
  }
  function parseTerm(): number {
    let left = parsePower();
    while (peek()?.type === 'op' && '*/%'.includes((peek() as { value: string }).value)) {
      const op = (next() as { type: 'op'; value: string }).value;
      const right = parsePower();
      if (op === '*') left *= right;
      else if (op === '/') left /= right;
      else left %= right;
    }
    return left;
  }
  function parsePower(): number {
    let base = parseUnary();
    if (peek()?.type === 'op' && peek()!.value === '^') { next(); base = Math.pow(base, parsePower()); }
    return base;
  }
  function parseUnary(): number {
    if (peek()?.type === 'op' && peek()!.value === '-') { next(); return -parseUnary(); }
    if (peek()?.type === 'op' && peek()!.value === '+') { next(); return parseUnary(); }
    return parsePrimary();
  }
  function parsePrimary(): number {
    const t = peek();
    if (!t) throw new Error('Unexpected end');
    if (t.type === 'number') { next(); return t.value; }
    if (t.type === 'const') { next(); return CONSTANTS[t.value]; }
    if (t.type === 'func') {
      const fn = FUNCTIONS[t.value]; next();
      if (peek()?.type !== 'lparen') throw new Error('Expected (');
      next(); const arg = parseExpr();
      if (peek()?.type !== 'rparen') throw new Error('Expected )');
      next(); return fn(arg);
    }
    if (t.type === 'lparen') {
      next(); const val = parseExpr();
      if (peek()?.type !== 'rparen') throw new Error('Expected )');
      next(); return val;
    }
    throw new Error(`Unexpected: ${JSON.stringify(t)}`);
  }

  const result = parseExpr();
  if (pos < tokens.length) throw new Error('Extra tokens');
  return result;
}

function safeEvaluate(expr: string): string {
  try {
    if (!expr.trim()) return '';
    const result = evaluateTokens(tokenize(expr));
    if (!isFinite(result)) return isNaN(result) ? 'Error' : 'Infinity';
    if (Number.isInteger(result)) return String(result);
    return parseFloat(result.toPrecision(12)).toString();
  } catch {
    return 'Error';
  }
}

// ── Button definitions ────────────────────────────────────────────────

interface CalcButton {
  label: string;
  value: string;
  type: 'number' | 'operator' | 'function' | 'action' | 'equal';
  span?: number;
}

const BASIC_BUTTONS: CalcButton[] = [
  { label: 'C', value: 'clear', type: 'action' },
  { label: '±', value: 'negate', type: 'action' },
  { label: '%', value: '%', type: 'operator' },
  { label: '÷', value: '/', type: 'operator' },
  { label: '7', value: '7', type: 'number' },
  { label: '8', value: '8', type: 'number' },
  { label: '9', value: '9', type: 'number' },
  { label: '×', value: '*', type: 'operator' },
  { label: '4', value: '4', type: 'number' },
  { label: '5', value: '5', type: 'number' },
  { label: '6', value: '6', type: 'number' },
  { label: '−', value: '-', type: 'operator' },
  { label: '1', value: '1', type: 'number' },
  { label: '2', value: '2', type: 'number' },
  { label: '3', value: '3', type: 'number' },
  { label: '+', value: '+', type: 'operator' },
  { label: '0', value: '0', type: 'number', span: 2 },
  { label: '.', value: '.', type: 'number' },
  { label: '=', value: '=', type: 'equal' },
];

const SCI_ROW: CalcButton[] = [
  { label: 'sin', value: 'sin(', type: 'function' },
  { label: 'cos', value: 'cos(', type: 'function' },
  { label: 'tan', value: 'tan(', type: 'function' },
  { label: 'log', value: 'log10(', type: 'function' },
  { label: 'ln', value: 'ln(', type: 'function' },
  { label: '√', value: 'sqrt(', type: 'function' },
  { label: 'π', value: 'pi', type: 'number' },
  { label: 'e', value: 'e', type: 'number' },
  { label: 'x²', value: '^2', type: 'operator' },
  { label: '(', value: '(', type: 'operator' },
  { label: ')', value: ')', type: 'operator' },
  { label: 'xʸ', value: '^', type: 'operator' },
];

function getButtonStyle(type: CalcButton['type']): string {
  switch (type) {
    case 'action':
      return 'bg-white/[0.12] text-white/80 hover:bg-white/[0.18] active:bg-white/[0.08]';
    case 'operator':
      return 'bg-amber-500/25 text-amber-300 hover:bg-amber-500/35 active:bg-amber-500/15';
    case 'equal':
      return 'bg-[#72d565]/30 text-[#72d565] hover:bg-[#72d565]/40 active:bg-[#72d565]/20 font-bold';
    case 'function':
      return 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 active:bg-indigo-500/10';
    default:
      return 'bg-white/[0.06] text-white/90 hover:bg-white/[0.12] active:bg-white/[0.04]';
  }
}

// ── Calculator Modal (Portal) ─────────────────────────────────────────

const CalculatorModal: React.FC<{ isZh: boolean; onClose: () => void }> = ({ isZh, onClose }) => {
  const [expression, setExpression] = useState('');
  const [display, setDisplay] = useState('0');
  const [hasResult, setHasResult] = useState(false);
  const [showSci, setShowSci] = useState(false);

  const handleButton = useCallback((btn: CalcButton) => {
    if (btn.value === 'clear') {
      setExpression(''); setDisplay('0'); setHasResult(false); return;
    }
    if (btn.value === '=') {
      const result = safeEvaluate(expression);
      setDisplay(result); setExpression(result === 'Error' ? '' : result); setHasResult(true); return;
    }
    if (btn.value === 'negate') {
      if (expression && expression !== '0') {
        if (expression.startsWith('-')) { setExpression(expression.slice(1)); setDisplay(expression.slice(1)); }
        else { setExpression(`(-${expression})`); setDisplay(`-${expression}`); }
      }
      return;
    }
    if (hasResult && btn.type === 'number' && !btn.value.startsWith('(')) {
      setExpression(btn.value); setDisplay(btn.value); setHasResult(false); return;
    }
    if (hasResult) setHasResult(false);
    const newExpr = expression + btn.value;
    setExpression(newExpr);
    setDisplay(newExpr.replace(/\*/g, '×').replace(/\//g, '÷'));
  }, [expression, hasResult]);

  // Keyboard input support
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      const key = e.key;
      if (/^[0-9.]$/.test(key)) { e.preventDefault(); handleButton({ label: key, value: key, type: 'number' }); return; }
      if (key === '+') { e.preventDefault(); handleButton({ label: '+', value: '+', type: 'operator' }); return; }
      if (key === '-') { e.preventDefault(); handleButton({ label: '−', value: '-', type: 'operator' }); return; }
      if (key === '*') { e.preventDefault(); handleButton({ label: '×', value: '*', type: 'operator' }); return; }
      if (key === '/') { e.preventDefault(); handleButton({ label: '÷', value: '/', type: 'operator' }); return; }
      if (key === '%') { e.preventDefault(); handleButton({ label: '%', value: '%', type: 'operator' }); return; }
      if (key === '^') { e.preventDefault(); handleButton({ label: 'xʸ', value: '^', type: 'operator' }); return; }
      if (key === '(') { e.preventDefault(); handleButton({ label: '(', value: '(', type: 'operator' }); return; }
      if (key === ')') { e.preventDefault(); handleButton({ label: ')', value: ')', type: 'operator' }); return; }
      if (key === 'Enter') { e.preventDefault(); handleButton({ label: '=', value: '=', type: 'equal' }); return; }
      if (key === 'Backspace') {
        e.preventDefault();
        setExpression(prev => { const n = prev.slice(0, -1); setDisplay(n || '0'); return n; });
        return;
      }
      if (key === 'Delete' || (key === 'c' && !e.ctrlKey && !e.metaKey) || (key === 'C' && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault(); handleButton({ label: 'C', value: 'clear', type: 'action' }); return;
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, handleButton]);

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-6 md:p-12"
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] animate-fadeIn" onClick={onClose} />

      {/* Window */}
      <div
        className="bg-black/30 backdrop-blur-xl border-0 sm:border border-white/10 rounded-none sm:rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto animate-scaleIn overflow-hidden select-none w-full h-full sm:w-[340px] sm:h-auto sm:max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none">
          <div className="flex items-center gap-2 w-auto md:w-20">
            <div className="hidden md:flex gap-2.5">
              <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <div className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] border border-black/20" />
              <div className="w-3.5 h-3.5 rounded-full bg-[#27c93f] border border-black/20" />
            </div>
          </div>
          <div className="flex-1 flex justify-center">
            <span className="text-[13px] font-semibold text-white/70">
              🧮 {isZh ? '科学计算器' : 'Calculator'}
            </span>
          </div>
          <div className="flex items-center w-auto md:w-20 justify-end">
            <button onClick={onClose} className="md:hidden w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="hidden md:block w-20" />
          </div>
        </div>

        {/* Calculator body */}
        <div className="flex flex-col p-4 gap-3">
          {/* Display */}
          <div className="bg-black/40 rounded-xl px-4 py-3 border border-white/[0.06]">
            <div className="text-[11px] text-white/30 truncate text-right leading-tight mb-1" style={{ minHeight: 16 }}>
              {expression.replace(/\*/g, '×').replace(/\//g, '÷') || '\u00A0'}
            </div>
            <div className="text-[28px] font-light text-white leading-none tabular-nums truncate text-right">
              {display}
            </div>
          </div>

          {/* Sci toggle + backspace */}
          <div className="flex items-center justify-between">
            <button
              className={`text-[11px] px-3 py-1 rounded-full transition-colors ${
                showSci ? 'bg-indigo-500/25 text-indigo-300' : 'bg-white/[0.06] text-white/40 hover:text-white/60'
              }`}
              onClick={() => setShowSci(!showSci)}
            >
              {isZh ? '科学函数' : 'Scientific'}
            </button>
            <button
              className="text-[11px] px-3 py-1 rounded-full bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors"
              onClick={() => {
                const newExpr = expression.slice(0, -1);
                setExpression(newExpr);
                setDisplay(newExpr || '0');
              }}
            >
              ⌫
            </button>
          </div>

          {/* Scientific row */}
          {showSci && (
            <div className="grid grid-cols-6 gap-1.5">
              {SCI_ROW.map((btn, i) => (
                <button
                  key={i}
                  className={`flex items-center justify-center rounded-lg text-[11px] font-medium transition-colors py-2 ${getButtonStyle(btn.type)}`}
                  onClick={() => handleButton(btn)}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}

          {/* Main buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            {BASIC_BUTTONS.map((btn, i) => (
              <button
                key={i}
                className={`flex items-center justify-center rounded-xl text-[16px] font-medium transition-colors py-3 ${getButtonStyle(btn.type)} ${btn.span === 2 ? 'col-span-2' : ''}`}
                onClick={() => handleButton(btn)}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
};

// ── Widget (small only — shows icon + last result, click opens modal) ─

export const CalculatorWidget: React.FC<{ size: WidgetSize }> = ({ size: _size }) => {
  const { language } = useTranslation();
  const isZh = language === 'zh';
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div
        className="w-full h-full flex items-center justify-center select-none overflow-hidden cursor-pointer gap-3 px-4"
        onClick={(e) => { e.stopPropagation(); setShowModal(true); }}
      >
        {/* Icon */}
        <div
          className="shrink-0 flex items-center justify-center rounded-xl"
          style={{
            width: 44,
            height: 44,
            background: 'linear-gradient(135deg, #f97316 0%, #fb923c 50%, #fdba74 100%)',
            boxShadow: '0 2px 8px rgba(249,115,22,0.4)',
          }}
        >
          <span className="text-[20px]">🧮</span>
        </div>
        {/* Text */}
        <div className="flex flex-col justify-center min-w-0" style={{ gap: '3px' }}>
          <span className="text-[15px] font-semibold text-white/90 leading-none tracking-tight">
            {isZh ? '科学计算器' : 'Calculator'}
          </span>
          <span className="text-[11px] text-white/45 leading-none">
            {isZh ? '点击打开计算器' : 'Tap to open'}
          </span>
        </div>
      </div>

      {showModal && (
        <CalculatorModal isZh={isZh} onClose={() => setShowModal(false)} />
      )}
    </>
  );
};
