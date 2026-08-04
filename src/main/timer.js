const { EventEmitter } = require('events');
const { powerMonitor } = require('electron');

const WORK = 'work';
const REST = 'rest';

/**
 * Break scheduler.
 *
 * Work time only accumulates while you are actually at the keyboard and not on
 * a call. Being idle past the threshold rewinds the work period to zero, which
 * is what makes an ad-hoc break away from the desk count as a real break.
 *
 * Events: tick, prewarn, prewarn-cancel, rest-start, rest-end
 */
class BreakTimer extends EventEmitter {
  constructor(getConfig) {
    super();
    this.getConfig = getConfig;

    this.state = WORK;
    this.workElapsed = 0;
    this.restRemaining = 0;
    this.restTotal = 0;

    this.inCall = false;
    this.callApps = [];
    this.pausedUntil = null;
    this.prewarnShown = false;

    this._interval = null;
  }

  workTarget() {
    return Math.max(60, Math.round(this.getConfig().workMinutes * 60));
  }

  start() {
    if (this._interval) return;
    this._interval = setInterval(() => this._tick(), 1000);

    // Coming back from lock or sleep is unambiguously a break.
    powerMonitor.on('unlock-screen', () => this._resetWork());
    powerMonitor.on('resume', () => this._resetWork());
  }

  stop() {
    clearInterval(this._interval);
    this._interval = null;
  }

  _resetWork() {
    this.workElapsed = 0;
    this._cancelPrewarn();
  }

  _cancelPrewarn() {
    if (this.prewarnShown) {
      this.prewarnShown = false;
      this.emit('prewarn-cancel');
    }
  }

  isPaused() {
    return this.pausedUntil !== null && Date.now() < this.pausedUntil;
  }

  /** Called by the call detector poll. */
  setCallState(inCall, apps) {
    const wasInCall = this.inCall;
    this.inCall = inCall;
    this.callApps = apps || [];

    if (inCall && !wasInCall) {
      // A call starting mid-break wins; the break stays owed.
      // Order matters: _endRest zeroes workElapsed, so re-owe it afterwards.
      if (this.state === REST) {
        this._endRest('call');
        this.workElapsed = this.workTarget();
      }
      this._cancelPrewarn();
    }

    if (!inCall && wasInCall) {
      // Give a grace period so the break does not land the instant you hang up.
      const grace = Math.max(0, this.getConfig().postCallGraceSeconds);
      const latest = Math.max(0, this.workTarget() - grace);
      if (this.workElapsed > latest) this.workElapsed = latest;
    }
  }

  _tick() {
    const cfg = this.getConfig();

    if (this.state === REST) {
      this.restRemaining -= 1;
      if (this.restRemaining <= 0) this._endRest('completed');
      this.emit('tick', this.snapshot());
      return;
    }

    if (this.isPaused()) {
      this._cancelPrewarn();
      this.emit('tick', this.snapshot());
      return;
    }
    if (this.pausedUntil !== null) this.pausedUntil = null;

    if (cfg.pauseDuringCalls && this.inCall) {
      this._cancelPrewarn();
      this.emit('tick', this.snapshot());
      return;
    }

    // getSystemIdleTime is Windows' own last-input timer, so it correctly counts
    // time spent in other apps, locked, or away from the machine entirely.
    const idle = powerMonitor.getSystemIdleTime();
    if (idle >= Math.max(10, cfg.idleResetSeconds)) {
      if (this.workElapsed !== 0) this._resetWork();
      this.emit('tick', this.snapshot());
      return;
    }

    this.workElapsed += 1;

    const target = this.workTarget();
    if (this.workElapsed >= target) {
      this._startRest();
    } else if (!this.prewarnShown && this.workElapsed >= target - cfg.prewarnSeconds) {
      this.prewarnShown = true;
      this.emit('prewarn', target - this.workElapsed);
    }

    this.emit('tick', this.snapshot());
  }

  _startRest() {
    const cfg = this.getConfig();
    this.state = REST;
    this.restTotal = Math.max(5, Math.round(cfg.restSeconds));
    this.restRemaining = this.restTotal;
    this.prewarnShown = false;
    this.emit('prewarn-cancel');
    this.emit('rest-start', { seconds: this.restTotal });
  }

  _endRest(reason) {
    this.state = WORK;
    this.restRemaining = 0;
    this.workElapsed = 0;
    this.emit('rest-end', reason);
  }

  // --- commands -----------------------------------------------------------

  takeBreakNow() {
    if (this.state === REST) return;
    this.pausedUntil = null;
    this._startRest();
  }

  skipBreak() {
    if (this.state !== REST) return;
    this._endRest('skipped');
  }

  postponeBreak() {
    const cfg = this.getConfig();
    const delay = Math.max(60, cfg.postponeMinutes * 60);
    if (this.state === REST) this._endRest('postponed');
    this.workElapsed = Math.max(0, this.workTarget() - delay);
    this.prewarnShown = false;
  }

  pauseFor(minutes) {
    this.pausedUntil = Date.now() + minutes * 60 * 1000;
    if (this.state === REST) this._endRest('paused');
    this._cancelPrewarn();
  }

  resume() {
    this.pausedUntil = null;
  }

  snapshot() {
    const target = this.workTarget();
    return {
      state: this.state,
      workElapsed: this.workElapsed,
      workTarget: target,
      secondsUntilBreak: Math.max(0, target - this.workElapsed),
      restRemaining: this.restRemaining,
      restTotal: this.restTotal,
      inCall: this.inCall,
      callApps: this.callApps,
      paused: this.isPaused(),
      pausedUntil: this.pausedUntil,
      idleSeconds: powerMonitor.getSystemIdleTime()
    };
  }
}

module.exports = { BreakTimer, WORK, REST };
