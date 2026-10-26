import ohm from './ohm.js';
import seriesParallel from './series-parallel.js';
import ledResistor from './led-resistor.js';
import switchLesson from './switch.js';
import measuring from './measuring-current.js';
import brightness from './brightness.js';
import lightSensor from './light-sensor.js';
import { Meter } from '../parts/meters.js';
import { Bulb, LED } from '../parts/passive.js';
import { PushButton, Potentiometer, LDR, Buzzer } from '../parts/extras.js';
import { coilModel, trafficModel } from '../ui/thumbs.js';

const g = (part) => part.group;

// Lessons without `build` show in the list as "Soon". `thumb` draws the list picture.
export const LESSONS = [
  { ...ohm, thumb: () => g(new Meter('A', { type: 'ammeter', range: 1 })) },
  { ...seriesParallel, thumb: () => g(new Bulb('Bulb')) },
  { ...ledResistor, thumb: () => g(new LED('LED', { color: 'red' })), thumbView: { az: -0.5, el: 0.35 } },
  { ...switchLesson, thumb: () => g(new PushButton('Button')) },
  { ...measuring, thumb: () => g(new Meter('V', { type: 'voltmeter', range: 10 })) },
  { ...brightness, thumb: () => g(new Potentiometer('Pot')) },
  { ...lightSensor, thumb: () => g(new LDR('LDR')), thumbView: { az: -0.3, el: 0.3 } },
  { id: 'buzzer', num: 8, title: 'Buzzer tones', meta: 'Frequency · Web Audio', thumb: () => g(new Buzzer('Buzzer')) },
  { id: 'electromagnet', num: 9, title: 'Electromagnet', meta: 'Magnetic effects · Class 10', chapter: 'magnetism', thumb: coilModel },
  { id: 'traffic-light', num: 10, title: 'Traffic light project', meta: 'Final project', thumb: trafficModel, thumbView: { az: -0.5, el: 0.25 } },
];
