import _defaults from 'lodash.defaults';

import createElement from 'virtual-dom/create-element';

import TimeScale from './render/TimeScale';
import Track from './render/Track';
import Playout from './Playout';
import PlayedHook from './render/PlayedHook';
import FragHook from './render/FragHook';
import FormHook from './render/FormHook';

import FragController from './track/controller/FragController';
import FormController from './track/controller/FormController';

import LoaderFactory from './track/loader/LoaderFactory';

export default class {
  constructor() {
    this.defaults = _defaults;
    this.duration = 0;
    this.scrollLeft = 0;
    this.tracks = [];
    this.timer = null;
    this.cycle = true;

    this.startTime = 0;
    this.stopTime = 0;
    this.pauseTime = 0;
    this.lastPlay = 0;
    this.formInfo = [{ start: 1, end: 3, title: '你猜是什么', extend: {} }];
    this.typeArr = ['input', 'checkbox'];
    this.typeArr = [{ type: 'input', name: '', title: '输入标题', option: '' },
                     { type: 'checkbox', name: 'demo', title: '输入标题', option: ['苹果', '香蕉', '橘子'] },
                     { type: 'radio', name: 'demo', title: '输入标题', option: ['苹果', '香蕉', '橘子'] }];

    this.fragDom = document.getElementById('waveFrag');
    this.canvasDom = document.getElementById('waveCanvse');
  }
  // 设置初始值
  setDefault(info) {
    this.markData = info || this.markData;
  }
  // 设置项目名称ID
  setSampleName(name) {
    this.name = name;
  }
  // 设置初始值
  setDataInfo() {
    if (localStorage[this.name]) {
      this.formInfo = JSON.parse(localStorage[this.name]);
    }
  }
  // 设置循环
  setCycle(bol) {
    this.cycle = bol;
  }
  // 音频码率
  setSampleRate(sampleRate) {
    this.sampleRate = sampleRate;
  }
  // 音频初始缩放比例
  setSamplesPerPixel(samplesPerPixel) {
    this.samplesPerPixel = samplesPerPixel;
  }
  // 音频AudioContext初始化
  setAudioContext(ac) {
    this.ac = ac;
  }
  // 初始化事件模块
  setEventEmitter(ee) {
    this.ee = ee;
  }
  // 设置wave高度
  setWaveHeight(height) {
    this.waveHeight = height;
  }
  // 设置曲线的颜色
  setColors(colors) {
    this.colors = colors;
  }
  // 设置缩放的区间
  setZoomLevels(levels) {
    this.zoomLevels = levels;
  }
  // 设置缩放index
  setZoomIndex(index) {
    this.zoomIndex = index;
  }
  // 设置缩放比例
  setZoom(zoomIndex) {
    const zoom = this.zoomLevels[zoomIndex];
    this.samplesPerPixel = zoom;
    this.tracks.forEach((track) => {
      track.calculatePeaks(zoom, this.sampleRate);
    });
  }
  // 设置show
  setControlOptions(controlOptions) {
    this.controls = controlOptions;
  }
  // 保存数据
  saveLocalStorage() {
    localStorage.setItem(this.name, JSON.stringify(this.formInfo));
  }
  // 工具类
  adjustDuration() {
    this.duration = this.tracks.reduce(
      (duration, track) => Math.max(duration, track.getEndTime()),
      0,
    );
  }
  // 添加新片段
  setFragHook(frag) {
    this.fragHook.renderAdd(frag, this.formInfo.length - 1);
    this.formHook.renderAdd(frag, this.formInfo.length - 1);
  }
  changeFragHook(frag, index) {
    this.formInfo.splice(index, 1, frag);
    this.formHook.render();
  }
  deleteFragHook(index) {
    this.formInfo.splice(index, 1);
    this.fragHook.render();
    this.formHook.render();
  }

  // 控制模块
  setUpEventEmitter() {
    const ee = this.ee;
    this.fragController = new FragController(ee, this.fragDom, this.formInfo, this.samplesPerPixel, this.sampleRate);
    this.fragController.bindEvent();
    this.formController = new FormController(ee, this.formInfo);
    this.formController.bindEvent();
    ee.on('play', (startTime, endTime) => {
      this.play(startTime, endTime);
    });
    ee.on('pause', () => {
      this.pause();
    });
    ee.on('playFrag', (index) => {
      const start = this.formInfo[index].start;
      const end = this.formInfo[index].end - start;
      this.play(start, end);
    });
    ee.on('changeFrag', (frag, index) => {
      this.changeFragHook(frag, index);
    });
    ee.on('addFrag', (frag) => {
      this.formInfo.push(frag);
      this.setFragHook(frag);
    });
    ee.on('selectdFrag', (index) => {
      this.formController.setClassName(index);
    });
    ee.on('deleteFrag', (index) => {
      this.deleteFragHook(index);
    });
    ee.on('zoom', (index) => {
      this.zoom(index);
    });
    document.body.onmousewheel = (e) => {
      const zoomIndex = e.deltaY === 100 ? 1 : -1;
      ee.emit('zoom', zoomIndex);
    };
  }
  // 是否播放
  isPlaying() {
    return this.tracks.reduce(
      (isPlaying, track) => isPlaying || track.isPlaying(),
      false,
    );
  }
  // 获取间隔时间TODO
  getElapsedTime() {
    return this.ac.currentTime - this.lastPlay;
  }
  // 停止
  playbackReset() {
    this.tracks.forEach((track) => {
      track.scheduleStop();
    });

    return Promise.all(this.playoutPromises);
  }
  // 启动动画
  startAnimation() {
    this.stopAnimation();
    this.timer = requestAnimationFrame((step) => {
      this.stepStart = step;
      this.animationRequest(step);
    });
  }
  animationRequest(step) {
    const stepStart = (step - this.stepStart) / 1000;
    this.lastPlay = this.startTime ? this.startTime + stepStart : this.pauseTime + stepStart;
    this.renderPlayed(this.lastPlay);
    this.timer = requestAnimationFrame((steps) => {
      this.animationRequest(steps);
    });
    if (this.lastPlay >= this.startTime + this.endTime) {
      if (this.cycle) {
        this.play(this.startTime, this.endTime);
        return;
      }
      this.stopAnimation();
      this.pauseTime = this.lastPlay;
    }
  }
  // 停止动画
  stopAnimation() {
    window.cancelAnimationFrame(this.timer);
  }
  // demo
  demo() {
    this.ee.emit('selectdFrag', 0);
  }

  // 播放
  play(startTime, endTime) {
    const start = startTime || this.pauseTime;
    const end = endTime || this.duration;
    this.startTime = startTime;
    this.endTime = end;
    if (this.isPlaying()) {
      return this.restartPlayFrom(start, end);
    }
    this.startAnimation();
    const playoutPromises = [];
    const currentTime = this.ac.currentTime;
    this.tracks.forEach((track) => {
      playoutPromises.push(track.schedulePlay(currentTime, start, end, {
        shouldPlay: true,
        masterGain: this.masterGain,
      }));
    });
    this.playoutPromises = playoutPromises;
    return Promise.all(this.playoutPromises);
  }
  // 暂停
  pause() {
    if (!this.isPlaying()) {
      return Promise.all(this.playoutPromises);
    }
    this.stopAnimation();
    this.pauseTime = this.lastPlay;
    return this.playbackReset();
  }
  // 停止
  stop() {
    this.stopAnimation();
    this.pauseTime = 0;
    this.renderPlayed(this.pauseTime);
    return this.playbackReset();
  }
  // 重新播放
  restartPlayFrom(start, end) {
    this.stopAnimation();

    this.tracks.forEach((editor) => {
      editor.scheduleStop();
    });

    return Promise.all(this.playoutPromises).then(this.play.bind(this, start, end));
  }
  // 缩放大小
  zoom(zoomStyle) {
    const index = this.zoomIndex + zoomStyle;
    if (index < this.zoomLevels.length && index >= 0) {
      this.zoomIndex = index;
    }
    this.setZoom(this.zoomIndex);
    this.fragController.setSamples(this.samplesPerPixel, this.sampleRate);
    this.renderPlayed(this.pauseTime);
    this.render();
  }

  // 加载音频并初始化显示
  load(trackList) {
    const loadPromises = trackList.map((trackInfo) => {
      const loader = LoaderFactory.createLoader(trackInfo.src, this.ac, this.ee);
      return loader.load();
    });
    return Promise.all(loadPromises).then((audioBuffers) => {
      const tracks = audioBuffers.map((audioBuffer, index) => {
        const info = trackList[index];
        const name = info.name || 'Untitled';
        const cueIn = info.cuein || 0;
        const cueOut = info.cueout || audioBuffer.duration;
        const selection = info.selected;
        const peaks = info.peaks || { type: 'WebAudio', mono: this.mono };
        const waveOutlineColor = info.waveOutlineColor || undefined;
        const playout = new Playout(this.ac, audioBuffer);
        const track = new Track(this.fragDom);
        track.src = info.src;
        track.setBuffer(audioBuffer);
        track.setName(name);
        track.setCues(cueIn, cueOut);
        track.setWaveOutlineColor(waveOutlineColor);

        if (selection !== undefined) {
          this.setActiveTrack(track);
          this.setTimeSelection(selection.start, selection.end);
        }
        if (peaks !== undefined) {
          track.setPeakData(peaks);
        }

        track.setPlayout(playout);

        track.calculatePeaks(this.samplesPerPixel, this.sampleRate);
        return track;
      });

      this.tracks = this.tracks.concat(tracks);
      this.adjustDuration();
      this.render();
    });
  }
  // 时间刻度记载
  renderTimeScale() {
    const controlWidth = this.controls.show ? this.controls.width : 0;
    const timeScale = new TimeScale(this.duration, this.scrollLeft,
      this.samplesPerPixel, this.sampleRate, controlWidth);
    return timeScale.render();
  }
  // 波形图绘制
  renderTrackSection() {
    const trackElements = this.tracks.map(track =>
      track.render(),
    );
    return trackElements;
  }
  // 播放过音频控制
  renderPlayed(seconds) {
    const played = new PlayedHook(seconds, this.samplesPerPixel, this.sampleRate, this.duration);
    return played.render();
  }
  // 加载片段框
  renderFrag() {
    this.fragHook = new FragHook(this.fragDom, this.formInfo, this.samplesPerPixel, this.sampleRate, this.ee);
    this.fragHook.render();
    this.formHook = new FormHook(this.typeArr, this.formInfo, this.samplesPerPixel, this.sampleRate, this.ee);
    this.formHook.render();
  }
  // 加载页面
  render() {
    const timeTree = this.renderTimeScale();
    const timeNode = createElement(timeTree);
    document.getElementById('timescale').innerHTML = '';
    document.getElementById('timescale').appendChild(timeNode);

    const canvasTree = this.renderTrackSection();
    this.canvasDom.innerHTML = '';
    if (canvasTree.length !== 0) {
      for (let i = 0; i < canvasTree.length; i++) {
        const canvasNode = createElement(canvasTree[i][0]);
        this.canvasDom.appendChild(canvasNode);
      }
    }

    this.renderFrag();
  }
}