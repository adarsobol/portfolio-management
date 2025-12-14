import React from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Initiative, Status, WorkType } from '../../types';

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
    <div className="flex flex-col h-full space-y-5">
      
      {/* Legend */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-5 items-center text-xs">
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
          <span className="font-bold text-slate-700 uppercase tracking-wide text-[10px]">Legend</span>
        </div>
        <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded-md bg-gradient-to-br from-blue-400 to-blue-500 shadow-sm"></div><span className="font-medium text-slate-600">Planned</span></div>
        <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded-md bg-gradient-to-br from-amber-400 to-amber-500 shadow-sm"></div><span className="font-medium text-slate-600">Unplanned</span></div>
        <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded-md bg-gradient-to-br from-red-400 to-red-500 shadow-sm"></div><span className="font-medium text-slate-600">Delayed / Risk</span></div>
        <div className="flex items-center gap-2"><div className="w-3.5 h-3.5 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-500 shadow-sm"></div><span className="font-medium text-slate-600">Complete</span></div>
        <div className="ml-auto text-slate-400 italic flex items-center gap-1.5">
          <span className="text-slate-300">•</span>
          Drag items to change ETA
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-indigo-50">
          <div className="flex items-center gap-4">
             <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2.5">
               <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg shadow-sm">
                 <Calendar className="text-white" size={18} />
               </div>
               {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
             </h3>
             <div className="flex bg-white/80 rounded-lg p-1 shadow-sm border border-slate-200">
               <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-md transition-all text-slate-600"><ChevronLeft size={16} /></button>
               <button onClick={today} className="px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-md transition-all">Today</button>
               <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-md transition-all text-slate-600"><ChevronRight size={16} /></button>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white">
           {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
             <div key={d} className="py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">{d}</div>
           ))}
        </div>
        
        <div className="grid grid-cols-7 auto-rows-fr bg-slate-100 gap-px">
           {days.map((date, idx) => {
             if (!date) return <div key={`empty-${idx}`} className="bg-slate-50/50 min-h-[130px]" />;
             
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
                 className={`bg-white min-h-[130px] p-2.5 hover:bg-blue-50/30 transition-colors group relative ${isToday ? 'bg-blue-50/50 ring-2 ring-blue-200 ring-inset' : ''}`}
               >
                 <div className={`text-xs font-bold mb-2 flex justify-between items-center ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>
                    <span className={isToday ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white w-7 h-7 flex items-center justify-center rounded-full shadow-sm font-bold" : "w-7 h-7 flex items-center justify-center"}>{date.getDate()}</span>
                    {dayItems.length > 0 && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">{dayItems.length}</span>
                    )}
                 </div>
                 
                 <div className="space-y-1.5">
                   {dayItems.map(item => {
                     const isRisk = item.status === Status.AtRisk;
                     const isUnplanned = item.workType === WorkType.Unplanned;
                     let bgClass = 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-800 border-blue-200 hover:from-blue-100 hover:to-blue-150';
                     if (isRisk) bgClass = 'bg-gradient-to-r from-red-50 to-red-100 text-red-800 border-red-200 hover:from-red-100 hover:to-red-150';
                     else if (item.status === Status.Done) bgClass = 'bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-800 border-emerald-200 hover:from-emerald-100 hover:to-emerald-150';
                     else if (isUnplanned) bgClass = 'bg-gradient-to-r from-amber-50 to-amber-100 text-amber-800 border-amber-200 hover:from-amber-100 hover:to-amber-150';

                     return (
                       <div
                         key={item.id}
                         draggable
                         onDragStart={(e) => onDragStart(e, item.id)}
                         className={`w-full text-left text-[10px] px-2 py-1.5 rounded-md border truncate font-semibold cursor-move shadow-sm transition-all hover:shadow-md ${bgClass}`}
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
