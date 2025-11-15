-- Some sample queries to test basic functionality using the database definition
-- found in the same directory.

SELECT *
FROM Employee
JOIN Position ON Employee.PositionID = Position.ID;

UPDATE Employee
SET FirstName = 'Terry'
WHERE ID = 1;

SELECT *
FROM Employee;

DELETE FROM Employee
WHERE ID = 2;

SELECT *
FROM Employee;
