// Reserve time in half-day slots without changing stored estimates or meeting minutes.
export const halfDay = value => Math.ceil((Math.max(0, Number(value) || 0) - 1e-9) * 2) / 2;
export const validEffort = (value, allowZero=false) => Number.isFinite(value) && value >= (allowZero?0:.5) && value <= 3650 && Number.isInteger(value*2);
export const calendarSpan = info => info?.end===null||info?.start===null?null:info.end-info.start+(info.endFraction??1);
