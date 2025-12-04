
import React from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Initiative, Status, WorkType } from '../types';

interface CalendarViewProps {
  filteredInitiatives: Initiative[];
  handleInlineUpdate: (id: string, field: keyof Initiative, value: any) => void;
  setEditingItem: (item: Initiative) => void;
  setIsModalOpen: (isOpen: boolean) => void;
  calendarDate: Date;
  setCalendarDate: (date: Date) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  filteredInitiatives,
  handleInlineUpdate,
  setEditingItem,
  setIsModalOpen,
  calendarDate,
  setCalendarDate
}) => {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = new Date(year, month, 1).getDay();
  
  const days = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));

  const prevMonth = () => setCalendarDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCalendarDate(new Date(year, month + 1, 1));
  const today = () => setCalendarDate(new Date());

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault(); 
  };

  const onDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    handleInlineUpdate(id, 'eta', dateStr);
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      
      {/* Legend */}
      <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center text-xs">
        <span className="font-bold text-slate-700 mr-2">Legend:</span>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-100 border border-blue-300"></div>Planned</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-amber-100 border border-amber-300"></div>Unplanned</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-100 border border-red-300"></div>Delayed / Risk</div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></div>Complete</div>
        <div className="ml-auto text-slate-400 italic">Drag items to change ETA</div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-4">
             <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
               <Calendar className="text-purple-600" />
               {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
             </h3>
             <div className="flex bg-slate-100 rounded-lg p-1">
               <button onClick={prevMonth} className="p-1 hover:bg-white rounded shadow-sm transition-all"><ChevronLeft size={16} /></button>
               <button onClick={today} className="px-3 text-xs font-semibold text-slate-600 hover:bg-white rounded shadow-sm transition-all">Today</button>
               <button onClick={nextMonth} className="p-1 hover:bg-white rounded shadow-sm transition-all"><ChevronRight size={16} /></button>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
           {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
             <div key={d} className="py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">{d}</div>
           ))}
        </div>
        
        <div className="grid grid-cols-7 auto-rows-fr bg-slate-100 gap-px border-b border-slate-200">
           {days.map((date, idx) => {
             if (!date) return <div key={`empty-${idx}`} className="bg-white min-h-[120px]" />;
             
             const offset = date.getTimezoneOffset();
             const localDate = new Date(date.getTime() - (offset*60*1000));
             const dateStr = localDate.toISOString().split('T')[0];

             const dayItems = filteredInitiatives.filter(i => i.eta === dateStr);
             const isToday = new Date().toDateString() === date.toDateString();

             return (
               <div 
                 key={dateStr} 
                 onDragOver={onDragOver}
                 onDrop={(e) => onDrop(e, dateStr)}
                 className={`bg-white min-h-[120px] p-2 hover:bg-slate-50 transition-colors group relative ${isToday ? 'bg-blue-50/30' : ''}`}
               >
                 <div className={`text-xs font-semibold mb-1 flex justify-between items-center ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>
                    <span className={isToday ? "bg-blue-600 text-white w-6 h-6 flex items-center justify-center rounded-full" : ""}>{date.getDate()}</span>
                    {dayItems.length > 0 && <span className="text-[10px] text-slate-400">{dayItems.length}</span>}
                 </div>
                 
                 <div className="space-y-1">
                   {dayItems.map(item => {
                     const isRisk = item.isAtRisk || item.status === Status.Delayed;
                     const isUnplanned = item.workType === WorkType.Unplanned;
                     let bgClass = 'bg-blue-100 text-blue-800 border-blue-200';
                     if (isRisk) bgClass = 'bg-red-100 text-red-800 border-red-200';
                     else if (item.status === Status.Complete) bgClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                     else if (isUnplanned) bgClass = 'bg-amber-100 text-amber-800 border-amber-200';

                     return (
                       <div
                         key={item.id}
                         draggable
                         onDragStart={(e) => onDragStart(e, item.id)}
                         className={`w-full text-left text-[10px] px-1.5 py-1 rounded border truncate font-medium cursor-move shadow-sm ${bgClass}`}
                         title={item.title}
                         onClick={() => { setEditingItem(item); setIsModalOpen(true); }}
                       >
                         {item.title}
                       </div>
                     );
                   })}
                 </div>
               </div>
             );
           })}
        </div>
      </div>
    </div>
  );
};
