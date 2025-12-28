import React from 'react';
import { HelpCircle, Book, Lightbulb, AlertTriangle, Users, Settings } from 'lucide-react';

export const HelpCenter: React.FC = () => {
  const helpSections = [
    {
      icon: Book,
      title: 'Getting Started',
      description: 'Learn the basics of using the Portfolio Manager',
      content: `# Getting Started

Welcome to the Portfolio Work Plan Manager! This guide will help you get started.

## Key Features

- **Initiative Management**: Create and track initiatives with status, priority, and effort metrics
- **5-Level Hierarchy**: Organize work by Asset Class → Pillar → Responsibility → Target → Initiative
- **Role-Based Access**: Different roles have different permissions
- **Multiple Views**: Table, Calendar, Metrics, and Resources dashboards
- **Real-time Collaboration**: See what others are working on in real-time

## Quick Start

1. **Create an Initiative**: Click the "+" button to create a new initiative
2. **Set Status**: Update initiative status as work progresses
3. **Track Effort**: Record estimated and actual effort
4. **Add Comments**: Collaborate with your team using comments and mentions`,
    },
    {
      icon: Users,
      title: 'Roles & Permissions',
      description: 'Understand your role and what you can do',
      content: `# Roles & Permissions

## Available Roles

- **Admin**: Full access to all features including user management
- **VP**: High-level view and management capabilities
- **Director**: Department or group management
- **Team Lead**: Manage initiatives and tasks assigned to your team
- **Portfolio Operations**: Operational oversight and reporting

## Permissions

Each role has specific permissions for:
- Creating initiatives (Planned/Unplanned)
- Editing initiatives (Own/All)
- Accessing admin features
- Managing workflows
- Viewing different tabs`,
    },
    {
      icon: AlertTriangle,
      title: 'Troubleshooting',
      description: 'Common issues and solutions',
      content: `# Troubleshooting

## Common Issues

### Can't see certain initiatives
- Check your filters (Asset Class, Owner, Work Type)
- Verify you have permission to view the tab
- Contact your admin if you believe you should have access

### Changes not saving
- Check your internet connection
- Refresh the page and try again
- Check browser console for errors

### Notifications not appearing
- Ensure you're logged in
- Check notification settings
- Refresh the page

## Getting Help

- Use the support widget (bottom right) to report bugs
- Contact your admin for permission issues
- Check the activity logs in Admin Panel for system issues`,
    },
  ];

  const [selectedSection, setSelectedSection] = React.useState(helpSections[0]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <HelpCircle className="w-8 h-8 text-blue-600" />
        <h1 className="text-3xl font-bold text-slate-900">Help Center</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow p-4 space-y-2">
            {helpSections.map((section, index) => {
              const Icon = section.icon;
              return (
                <button
                  key={index}
                  onClick={() => setSelectedSection(section)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                    selectedSection === section
                      ? 'bg-blue-50 border-2 border-blue-500'
                      : 'hover:bg-slate-50 border-2 border-transparent'
                  }`}
                >
                  <Icon className="w-5 h-5 text-blue-600" />
                  <div>
                    <div className="font-semibold text-slate-900">{section.title}</div>
                    <div className="text-xs text-slate-500">{section.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="prose max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">
                {selectedSection.content}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpCenter;

