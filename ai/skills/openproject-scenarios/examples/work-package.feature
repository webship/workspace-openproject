@work-packages
Feature: A work package worked by a member
  A member moves a work package of its own through the workflow, comments on it, logs time on it and assigns it.
  The work package goes after the scenario, with all of it.

  Scenario: Its status, a comment, the time logged and the assignee
    Given there is a work package "Webship test work" in the project "webship-site"
    And I am a logged in user with the "member" user
    When I open the work package "Webship test work"
    And I set the status of the work package to "In progress"
    And I comment "Checked on the test site" on the work package
    And I log "0.5" hours on the work package with the comment "Read the work package"
    And I assign the work package to "Member Test"
    Then the status of the work package should be "In progress"
    And the work package should show the comment "Checked on the test site" by "Member Test"
    And the time spent on the work package should be "0.5h"
    And the work package should be assigned to "Member Test"
