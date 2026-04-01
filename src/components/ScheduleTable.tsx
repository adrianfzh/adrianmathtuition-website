'use client';

import { useEffect, useState } from 'react';

interface Slot {
  day: string;
  time: string;
  type: string;
  filled: number;
  capacity: number;
}

function Dots({ filled, capacity }: { filled: number; capacity: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-[3px]">
        {Array.from({ length: capacity }).map((_, i) => (
          <span
            key={i}
            className={`w-2 h-2 rounded-full ${i < filled ? 'bg-black/80' : 'bg-black/20'}`}
          />
        ))}
      </div>
      <span className="text-[12px] font-bold text-black/80">{filled}/{capacity}</span>
    </div>
  );
}

const TIME_ORDER = ['9-11am', '11am-1pm', '1-3pm', '3-5pm', '5-7pm', '7-9pm'];
const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL: Record<string, string> = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday',
};

export default function ScheduleTable() {
  const [timeSlots, setTimeSlots] = useState<Record<string, Record<string, Slot>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/schedule')
      .then(r => r.json())
      .then(data => {
        const ts: Record<string, Record<string, Slot>> = {};
        (data.slots || []).forEach((slot: Slot) => {
          if (!ts[slot.time]) ts[slot.time] = {};
          ts[slot.time][slot.day] = slot;
        });
        setTimeSlots(ts);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border p-6 md:p-8 max-w-4xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="font-display text-3xl text-navy mb-1">Lesson Schedule</h2>
        <p className="text-muted-foreground text-sm">Find an available slot and book your free trial</p>
      </div>

      <div className="overflow-x-auto">
        <p className="text-center text-xs text-muted-foreground mb-2 animate-pulse md:hidden">&larr; Swipe to see all days &rarr;</p>
        <table className="w-full text-sm min-w-[540px] border-separate border-spacing-x-3 border-spacing-y-2">
          <thead>
            <tr>
              <th className="text-left text-muted-foreground font-medium pb-2 w-24">Time</th>
              {DAY_ORDER.map(d => (
                <th key={d} className="text-center font-semibold text-navy pb-2 w-24">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-muted-foreground">Loading schedule&hellip;</td>
              </tr>
            ) : (
              TIME_ORDER.filter(t => timeSlots[t]).map(time => (
                <tr key={time}>
                  <td className="text-left text-muted-foreground font-medium py-1 border-t border-border whitespace-nowrap">{time}</td>
                  {DAY_ORDER.map(day => {
                    const slot = timeSlots[time]?.[day];
                    if (!slot) {
                      return <td key={day} className="text-center py-1 border-t border-border"><span className="text-muted-foreground/30">&mdash;</span></td>;
                    }
                    const isAvailable = slot.filled < slot.capacity;
                    const isJC = slot.type === 'JC';
                    const msg = encodeURIComponent(`Hi Adrian, I'd like to book a free trial lesson for ${DAY_FULL[day]} at ${time}`);
                    const baseSlotClass = "flex flex-col items-center justify-center min-h-[110px] min-w-[75px] md:min-w-[100px] p-1.5 rounded-lg font-semibold transition-all duration-200";

                    const bg = isJC ? 'bg-amber-light' : 'bg-[hsl(350,65%,85%)]';
                    const hoverBg = isJC ? 'hover:bg-amber' : 'hover:bg-[hsl(350,75%,75%)]';

                    if (isAvailable) {
                      return (
                        <td key={day} className="py-1 border-t border-border text-center">
                          <a
                            href={`https://wa.me/6591397985?text=${msg}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${baseSlotClass} ${bg} ${hoverBg} text-[hsl(220,60%,15%)] hover:-translate-y-px`}
                          >
                            <span className="block text-[15px] font-bold mb-0.5">{slot.type}</span>
                            <span className="block text-[13px] font-medium mb-0.5 opacity-90">{day} {slot.time}</span>
                            <Dots filled={slot.filled} capacity={slot.capacity} />
                            <span className="text-[12px] font-bold text-green-600 mt-0.5 tracking-wide">available</span>
                          </a>
                        </td>
                      );
                    } else {
                      return (
                        <td key={day} className="py-1 border-t border-border text-center">
                          <span className={`${baseSlotClass} ${bg} text-[hsl(220,60%,15%)] cursor-default`}>
                            <span className="block text-[15px] font-bold mb-0.5">{slot.type}</span>
                            <span className="block text-[13px] font-medium mb-0.5 opacity-90">{day} {slot.time}</span>
                            <Dots filled={slot.filled} capacity={slot.capacity} />
                            <span className="text-[11px] italic text-black/50 mt-0.5">full</span>
                          </span>
                        </td>
                      );
                    }
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
