/**
 * 计算股票波动系数（可跨股票对比）
 * @param {Array} data - 当前区间K线数据，按日期升序，每项有closePrice
 * @param {number} maWindow - 均线窗口，默认60
 * @returns {Object} 包含详细计算结果的对象
 */
export function calcVolatility(data, maWindow = 60, years = 5) {
  if (!data || data.length < maWindow + 2) {
    return {
      volatility: 0,
      stdOverMean: 0,
      maxFluct: 0,
      details: {
        maStd: 0,
        maMean: 0,
        priceMax: 0,
        priceMin: 0
      }
    };
  }

  // 1. 只取最近 years 年的数据
  let filteredData = data;
  if (years && data.length > 0) {
    const lastDate = data[data.length - 1].date;
    const lastYear = Number(lastDate.slice(0, 4));
    filteredData = data.filter(d => Number(d.date.slice(0, 4)) >= lastYear - years + 1);
    // 若不足 maWindow 条，补全
    if (filteredData.length < maWindow + 2) {
      filteredData = data.slice(-1 * (maWindow + 2));
    }
  }

  // 2. 计算MA60序列
  const maArr = [];
  for (let i = maWindow - 1; i < filteredData.length; i++) {
    const sum = filteredData.slice(i - maWindow + 1, i + 1).reduce((a, b) => a + b.closePrice, 0);
    maArr.push(sum / maWindow);
  }

  // 3. 计算MA60的标准差/均值（无量纲）
  const mean = maArr.reduce((a, b) => a + b, 0) / maArr.length;
  const std = Math.sqrt(maArr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / maArr.length);
  const stdOverMean = std / mean;

  // 4. 计算区间最大涨跌幅（无量纲）- 忽略0.5%极端值
  const closes = filteredData.map(d => d.closePrice).sort((a, b) => a - b);
  const totalCount = closes.length;
  const ignoreCount = Math.floor(totalCount * 0.005); // 忽略0.5%的极端值
  
  // 去掉最高和最低的0.5%
  const filteredCloses = closes.slice(ignoreCount, totalCount - ignoreCount);
  const max = Math.max(...filteredCloses);
  const min = Math.min(...filteredCloses);
  // 新的温和指数放大算法
  const upFluct = (max - mean) / mean;
  const downFluct = (mean - min) / mean;
  const powUp = Math.pow(upFluct, 1.5);
  const powDown = Math.pow(downFluct, 1.5);
  const maxFluct = Math.max(powUp, powDown);

  // 5. 综合波动系数（标准差/均值 + 最大涨跌幅权重）
  // 这两个都是"比例"，可以直接加权
  const volatility = stdOverMean + maxFluct * 0.7;

  return {
    volatility: Number(volatility.toFixed(4)),
    stdOverMean: Number(stdOverMean.toFixed(4)),
    maxFluct: Number(maxFluct.toFixed(4)),
    details: {
      maStd: Number(std.toFixed(2)),
      maMean: Number(mean.toFixed(2)),
      priceMax: Number(max.toFixed(2)),
      priceMin: Number(min.toFixed(2))
    }
  };
}

export function calcVolatilityV2(data, maWindow = 60, years = 5){
  if (!data || data.length < maWindow + 2) {
    return {
      volatility: 0,
      stdOverMean: 0,
      maxFluct: 0,
      details: {
        maStd: 0,
        maMean: 0,
        priceMax: 0,
        priceMin: 0
      }
    };
  }

  // 1. 只取最近 years 年的数据
  let filteredData = data;
  if (years && data.length > 0) {
    const lastDate = data[data.length - 1].date;
    const lastYear = Number(lastDate.slice(0, 4));
    filteredData = data.filter(d => Number(d.date.slice(0, 4)) >= lastYear - years + 1);
    // 若不足 maWindow 条，补全
    if (filteredData.length < maWindow + 2) {
      filteredData = data.slice(-1 * (maWindow + 2));
    }
  }

  // 2. 计算MA60序列
  const maArr = [];
  for (let i = maWindow - 1; i < filteredData.length; i++) {
    const sum = filteredData.slice(i - maWindow + 1, i + 1).reduce((a, b) => a + b.closePrice, 0);
    maArr.push(sum / maWindow);
  }

  return volatilityWithDiff(maArr);
}

function volatilityWithDiff(arr, alpha = 1, beta = 1) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length);
  // 差分
  const diffs = [];
  for (let i = 1; i < arr.length; i++) {
    diffs.push(arr[i] - arr[i - 1]);
  }
  const diffMean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const diffStd = Math.sqrt(diffs.reduce((a, b) => a + Math.pow(b - diffMean, 2), 0) / diffs.length);
  // 综合波动
  return Number(alpha * (std / mean) + beta * diffStd).toFixed(4);
}


// 计算最近一年长阳线数量
export function calcLongBullCount(data, zhangDieFu = 6, yearCount = 1) {
  if (!data || data.length === 0) return 0;
  // 取最近一年数据（假设每年约250个交易日）
  const N = yearCount * 250;
  const recent = data.slice(-N);
  let count = 0;
  for (const d of recent) {
    if (
      (((d.maxPrice - d.openPrice) / d.openPrice) * 100 > zhangDieFu) || d.zhangDieFu > zhangDieFu
    ) {
      count++;
    }
  }
  return count;
}

// 统计最近一年跌停次数
export function calcDownLimitCount(data, yearCount = 1) {
  if (!data || data.length === 0) return 0;
  const N = yearCount * 250;
  const recent = data.slice(-N);
  let count = 0;
  for (const d of recent) {
    if (d.zhangDieFu <= -9.8) {
      count++;
    }
  }
  return count;
}

export function calcLockedLimitDownCount(data, yearCount = 1) {
  if (!data || data.length === 0) return 0;
  // 取最近一年数据（假设每年约250个交易日）
  const N = yearCount * 250;
  const recent = data.slice(-N);
  let count = 0;
  for (const d of recent) {
    if (
      d.openPrice === d.closePrice &&
      d.zhangDieFu <= -9.8
    ) {
      count++;
    }
  }
  return count;
}


// 统一股票统计方法，后续可扩展
export function calcStockStats(data) {
  return {
    ...calcVolatility(data, 60),
    longBullCount: calcLongBullCount(data, 6, 1),
    downLimitCount: calcDownLimitCount(data, 1),
    lockedLimitDownCount: calcLockedLimitDownCount(data, 1),
    volatilityV2: calcVolatilityV2(data)
  };
} 

// 成交量上涨
function tradingVolumeInc(recent, compare, threshold=0.25) {
    const avgVolRecent = recent.reduce((sum, d) => sum + d.chenJiaoLiang, 0) / recent.length;
    const avgVolCompare = compare.reduce((sum, d) => sum + d.chenJiaoLiang, 0) / compare.length;
    return {
      result: avgVolRecent * (1 - threshold) > avgVolCompare,
      avgVolRecent: Number(avgVolRecent.toFixed(0)),
      avgVolCompare: Number(avgVolCompare.toFixed(0)),
      ratio: Number((avgVolRecent / avgVolCompare).toFixed(2))
    };
}

// 交易价格下跌
function priceDecline(recent, compare, threshold=0.1) {
    const avgCloseRecent = recent.reduce((sum, d) => sum + d.closePrice, 0) / recent.length;
    const avgCloseCompare = compare.reduce((sum, d) => sum + d.closePrice, 0) / compare.length;
    return {
      result: avgCloseRecent * (1 - threshold) < avgCloseCompare,
      // 明显增长
      sharpIncrease: avgCloseRecent * (1 - threshold * 2) > avgCloseCompare,
      avgCloseRecent: Number(avgCloseRecent.toFixed(2)),
      avgCloseCompare: Number(avgCloseCompare.toFixed(2)),
      ratio: Number((avgCloseRecent / avgCloseCompare).toFixed(2))
    };
}

export function incrementalDecline(data) {
    if (!data || data.length < 756) { // 2年半数据，252*2+252
      return { isDecline: false, reason: '数据不足', detail: null, scenarios: [] };
    }
    // 场景定义：
    const scenarios = [
        { label: '半年对比前1年', recent: 126, compare: 250 },
        { label: '半年对比前两年', recent: 126, compare: 504 },
        { label: '一年对比前两年', recent: 252, compare: 504 },
        { label: '一年半比前两年', recent: 378, compare: 504 },
        { label: '两年对比前两年', recent: 504, compare: 504 },
      ];
    let matched = false;
    let scenario = null;
    const scenarioResults = [];
    let finalScenarioResult = {};
    for (const s of scenarios) {
      if (data.length < s.recent + s.compare) continue;
      const recent = data.slice(-s.recent);
      const compare = data.slice(-(s.recent + s.compare), -s.recent);
      const volRes = tradingVolumeInc(recent, compare);
      const priceRes = priceDecline(recent, compare);
      const thisResult = {
        label: s.label,
        tradingVolumeInc: volRes.result,
        avgVolRecent: volRes.avgVolRecent,
        avgVolCompare: volRes.avgVolCompare,
        priceDecline: priceRes.result,
        avgCloseRecent: priceRes.avgCloseRecent,
        avgCloseCompare: priceRes.avgCloseCompare,
      };
      scenarioResults.push(thisResult);
      finalScenarioResult = thisResult;
      if(priceRes.result === false) {
        if(priceRes.sharpIncrease) {
          break;
        } else {
          continue;
        }
      }
      if (priceRes.result && volRes.result) {
        matched = true;
        scenario = s;
        break;
      }
    }
    if(matched) {
      return {
        isDecline: true,
        scenario: scenario.label,
        scenarios: scenarioResults,
        finalScenarioResult: finalScenarioResult
      };
    }
    return { isDecline: false, reason: '均不满足增量下跌', detail: null, scenarios: scenarioResults };
}



// 股票分数计算

const volatilityScoreConfig = {
  weight: 30,
  config: [
    { start: 0,   end: 0.1, scoreStart: 10, scoreEnd: 10 },
    { start: 0.1, end: 0.3, scoreStart: 10, scoreEnd: 10 },
    { start: 0.3, end: 0.8, scoreStart: 10, scoreEnd: 5 },
    { start: 0.8, end: 1.5,   scoreStart: 5,  scoreEnd: 2 },
    { start: 1.5, end: 3,   scoreStart: 1,  scoreEnd: 1 },
    { start: 3,   end: 999, scoreStart: 0,  scoreEnd: 0 },
  ]
} ;

const longLineConfig = {
  weight: 10,
  config: [
    { start: 0,     end: 5, scoreStart: 0, scoreEnd: 2 },
    { start: 5,     end: 10, scoreStart: 2, scoreEnd: 5 },
    { start: 10,    end: 30, scoreStart: 5, scoreEnd: 10 },
    { start: 30,    end: 50, scoreStart: 10, scoreEnd: 8 },
    { start: 50,    end: 999, scoreStart: 1, scoreEnd: 1 },
  ]
};

const volumeIncPercentConfig = {
  weight: 20,
  config: [
    { start: 0,     end: 0.5, scoreStart: -10, scoreEnd: -10 },
    { start: 0.5,   end: 0.9, scoreStart: -5, scoreEnd: -5 },
    { start: 0.9,   end: 3, scoreStart: 5, scoreEnd: 10 },
    { start: 3,     end: 5, scoreStart: 10, scoreEnd: 8 },
    { start: 5,     end: 999, scoreStart: 5, scoreEnd: 5 },
  ]
};

const priceIncPercentConfig = {
  weight: 20,
  config: [
    { start: 0,   end: 0.5, scoreStart: -10, scoreEnd: -5 },
    { start: 0.5,   end: 1, scoreStart: 10, scoreEnd: 8 },
    { start: 1,   end: 1.5, scoreStart: 8, scoreEnd: 6 },
    { start: 1.5,   end: 999, scoreStart: -10, scoreEnd: -10 },
  ]
};

const incrementalDeclineConfig = {
  weight: 20
}

const sidewaysBreakBelowConfig = {
  weight: 20,
  config: [
    { start: 0,   end: 10, scoreStart: 0, scoreEnd: 10 },
    { start: 10,   end: 99, scoreStart: 10, scoreEnd: 10 },
  ]
}

const lockedLimitDownConfig = {
  weight: 20,
  config: [
    { start: 0,   end: 3, scoreStart: 0, scoreEnd: 0 },
    { start: 3,   end: 10, scoreStart: -5, scoreEnd: -10 },
    { start: 10,   end: 99, scoreStart: -10, scoreEnd: -10 },
  ]
}

const consecutiveLimitUpDayConfig = {
  weight: 10,
  config: [
    { start: 2,   end: 6, scoreStart: 5, scoreEnd: 10 },
    { start: 6,   end: 10, scoreStart: 10, scoreEnd: 5 },
    { start: 10,  end: 99, scoreStart: -10, scoreEnd: -99 },
  ]
}

// 横盘破价年数
function calcSidewaysBreakBelowYears(data) {
  if (!data || data.length === 0) return 0;
  // 1. 获取最近半年数据（假设每年250个交易日，半年125天）
  const N = 250;
  const recent = data.slice(-N);
  if (recent.length === 0) return 0;

  // 2. 找到最近半年最低价索引
  let minPrice = recent[0].minPrice;
  let minIdx = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].minPrice < minPrice) {
      minPrice = recent[i].minPrice;
      minIdx = i;
    }
  }

  // 3. 在更早的数据中查找比这个最低价还低的索引
  const before = data.slice(0, data.length - N + minIdx);
  let lastLowerIdx = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    if (before[i].minPrice < minPrice * 0.95) {
      lastLowerIdx = i;
      break;
    }
  }

  const diffYears = (before.length - lastLowerIdx) / 245;
  return Number(diffYears.toFixed(0));
}

function consecutiveLimitUpDaysScore(data) {
  const days = consecutiveLimitUpDays(data);
  let score = 0;
  for(let item of days) {
    let itemScore = getScore(consecutiveLimitUpDayConfig, item);
    score = score + itemScore;
  }

  return {
    value: days,
    score: score,
    weight: consecutiveLimitUpDayConfig.weight,
    name: "连续涨停(附加)"
  }
}


function consecutiveLimitUpDays(data) {
  // 只计算最近250天数据，假设data已按日期升序排列
  if (!data || data.length === 0) return [];
  const recentData = data.slice(-250);
  // 连续涨停定义：连续>=2天涨跌幅>=9.9
  const res = [];
  let count = 0;
  for (let i = 0; i < recentData.length; i++) {
    if (recentData[i].zhangDieFu >= 9.9) {
      count++;
    } else {
      if (count >= 2) res.push(count);
      count = 0;
    }
  }
  if (count >= 2) res.push(count);
  return res;
}


export function calcScore(data) {
  // 波动系数
  const volatility5year = calcVolatility(data, 60, 5).volatility;
  const volatility4year = calcVolatility(data, 48, 4).volatility;
  // const volatility4year = 10;
  let volatility;
  if(volatility5year < 1) {
    volatility = volatility4year < volatility5year ? volatility4year : volatility5year;
  } else {
    volatility = volatility5year;
  }
  
  const volatilityScore = getScore(volatilityScoreConfig, volatility);

  // 长阳线
  const longLine = calcLongBullCount(data, 6, 1);
  const longLineScore = getScore(longLineConfig, longLine);

  // 增量下跌
  const incrementalDeclineValue = incrementalDecline(data);
  let incrementalDeclineScore = 0;
  let volumeIncPercent = 0;
  let volumeIncPercentScore = 0;
  
  let priceIncPercent = 0;
  let priceIncPercentScore = 0;
  if(incrementalDeclineValue.isDecline === true) {
    incrementalDeclineScore = 20;
    volumeIncPercent = incrementalDeclineValue.finalScenarioResult.avgVolRecent / incrementalDeclineValue.finalScenarioResult.avgVolCompare;
    volumeIncPercent = Number(volumeIncPercent.toFixed(2));
    volumeIncPercentScore = getScore(volumeIncPercentConfig, volumeIncPercent);

    priceIncPercent = incrementalDeclineValue.finalScenarioResult.avgCloseRecent / incrementalDeclineValue.finalScenarioResult.avgCloseCompare;
    priceIncPercent = Number(priceIncPercent.toFixed(2));
    priceIncPercentScore = getScore(priceIncPercentConfig, priceIncPercent);
  } 

  // 横盘波动做附加计算--破价附加分
  let sidewaysBreakBelowYearScore = 0;
  let sidewaysBreakBelowYear = 0;
  let consecutiveLimitUpDaysResult = {
    value: 0,
    score: 0,
    weight: consecutiveLimitUpDayConfig.weight,
    name: "连续涨停(附加)"
  };
  if(volatility < 0.5) {
    sidewaysBreakBelowYear = calcSidewaysBreakBelowYears(data);
    sidewaysBreakBelowYearScore = getScore(sidewaysBreakBelowConfig, sidewaysBreakBelowYear);

    consecutiveLimitUpDaysResult = consecutiveLimitUpDaysScore(data);
  }
  
  let lockedLimitDown = calcLockedLimitDownCount(data);
  let lockedLimitDownScore = getScore(lockedLimitDownConfig, lockedLimitDown);

  let score = volatilityScore + longLineScore + volumeIncPercentScore + priceIncPercentScore + incrementalDeclineScore + lockedLimitDownScore ;

  let extraScore = sidewaysBreakBelowYearScore + consecutiveLimitUpDaysResult.score;

  score = Number(score.toFixed(2));
  extraScore = Number(extraScore.toFixed(2));

  return {
    extraScore,
    score,
    volatilityResult: {
      value: volatility,
      score: volatilityScore,
      weight: volatilityScoreConfig.weight,
      name: "波动系数"
    },
    longLineResult: {
      value: longLine,
      score: longLineScore,
      weight: longLineConfig.weight,
      name: "长阳线"
    },
    volumeResult: {
      value: volumeIncPercent,
      score: volumeIncPercentScore,
      weight: volumeIncPercentConfig.weight,
      name: "交易量"
    },
    priceResult: {
      value: priceIncPercent,
      score: priceIncPercentScore,
      weight: priceIncPercentConfig.weight,
      name: "股价"
    },
    incrementalDeclineResult: {
      value: incrementalDeclineScore,
      score: incrementalDeclineScore,
      weight: incrementalDeclineConfig.weight,
      name: "增量下跌"
    },
    sidewaysBreakBelowYearsResult: {
      value: sidewaysBreakBelowYear,
      score: sidewaysBreakBelowYearScore,
      weight: sidewaysBreakBelowConfig.weight,
      name: "破价年数(附加)"
    },
    lockedLimitDownResult: {
      value: lockedLimitDown,
      score: lockedLimitDownScore,
      weight: lockedLimitDownConfig.weight,
      name: "一字跌停扣分"
    },
    consecutiveLimitUpDaysResult: consecutiveLimitUpDaysResult
  }

}



function getScore(config, value) {
  const stepConfig = config.config;
  const weight = config.weight;
  if(value === NaN || value === 0) {
    return 0;
  }

  for (let i = 0; i < stepConfig.length; i++) {
    const { start, end, scoreStart, scoreEnd } = stepConfig[i];
    if (value >= start && value < end) {
      if (end === start) return scoreStart;
      const ratio = (value - start) / (end - start);
      const score = scoreStart + (scoreEnd - scoreStart) * ratio;
      return Number((score* (weight / 10)).toFixed(2) );
    }
  }
  return 0;
}
